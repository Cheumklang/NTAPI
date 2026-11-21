<#
UI Automation bridge - the Windows half of "the agent can see the desktop".

Why a helper process instead of a native module: UI Automation ships inside
Windows (10 and 11 alike), so one script is the whole adapter - nothing to
compile, nothing to rebuild for each Electron version, nothing to download.
It also keeps the risky part out of the Electron process: a hung application
can only hang this script, and the caller kills it.

Commands (one per run, JSON on stdout, exit code 0 only for {"ok": true}):

  probe                        how many top-level windows are open
  windows                      the open windows, with index and process
  snapshot --app N [--max K]   the tree of one window, with refs
  act --ref 3/0/2 --action click|settext [--text T]

Refs are child-index paths from the desktop root, the same shape the Linux
helper uses ("3/0/2" = window 3, child 0, child 2), so the prompt and the
guard above do not care which system sits underneath. They are as short-lived
as the tree they came from: snapshot again after acting.

Run by hand to debug from PowerShell:

  powershell -NoProfile -ExecutionPolicy Bypass -File uia.ps1 windows
#>
param(
  [Parameter(Position = 0)][string]$Command = '',
  [int]$App = -1,
  [int]$Max = 250,
  [string]$Ref = '',
  [string]$Action = 'click',
  [string]$Text = ''
)

$ErrorActionPreference = 'Stop'
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
} catch {
  [Console]::Out.Write((@{ ok = $false; code = 'NO_UIA'; error = "UI Automation is missing: $($_.Exception.Message)" } | ConvertTo-Json -Compress))
  exit 1
}

$script:Walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$script:Desktop = [System.Windows.Automation.AutomationElement]::RootElement
# Deep enough for a browser page or a settings dialog, shallow enough that one
# vendor's infinite virtual list cannot keep the walk busy.
$script:MaxDepth = 14
$script:Limit = 250
$script:Nodes = New-Object System.Collections.ArrayList

function Write-Json($payload) {
  [Console]::Out.Write(($payload | ConvertTo-Json -Compress -Depth 8))
  [Console]::Out.Write("`n")
  [Console]::Out.Flush()
}

function Stop-With-Error([string]$code, [string]$message) {
  Write-Json @{ ok = $false; code = $code; error = $message }
  exit 1
}

# Every property of another application's tree can throw when the window went
# away mid-walk, so each read is guarded on its own.
function Get-Children($element) {
  $list = New-Object System.Collections.ArrayList
  try {
    $child = $script:Walker.GetFirstChild($element)
    while ($null -ne $child) {
      [void]$list.Add($child)
      $child = $script:Walker.GetNextSibling($child)
    }
  } catch { }
  return , $list
}

function Test-Pattern($element, $pattern) {
  try {
    return ($null -ne $element.GetCurrentPattern($pattern))
  } catch {
    return $false
  }
}

function Test-Is-Window($element) {
  try {
    return (([string]$element.Current.ControlType.ProgrammaticName) -eq 'ControlType.Window')
  } catch {
    return $false
  }
}

function Get-Node($element, [string]$ref, [int]$depth) {
  $node = [ordered]@{ ref = $ref; depth = $depth }
  try { $node.role = ([string]$element.Current.ControlType.ProgrammaticName) -replace '^ControlType\.', '' } catch { $node.role = 'unknown' }
  try { $node.name = [string]$element.Current.Name } catch { $node.name = '' }
  try { $node.id = [string]$element.Current.AutomationId } catch { $node.id = '' }
  try { $node.class = [string]$element.Current.ClassName } catch { $node.class = '' }
  try { $node.processId = [int]$element.Current.ProcessId } catch { $node.processId = 0 }
  try { $node.enabled = [bool]$element.Current.IsEnabled } catch { $node.enabled = $false }
  try { $node.offscreen = [bool]$element.Current.IsOffscreen } catch { $node.offscreen = $true }
  try {
    $rect = $element.Current.BoundingRectangle
    if (-not $rect.IsEmpty) {
      $node.bounds = [ordered]@{ x = [int]$rect.X; y = [int]$rect.Y; w = [int]$rect.Width; h = [int]$rect.Height }
    }
  } catch { }

  # What can be *pressed* is part of the description: the caller is told which
  # actions exist instead of guessing a coordinate.
  $patterns = New-Object System.Collections.ArrayList
  if (Test-Pattern $element ([System.Windows.Automation.InvokePattern]::Pattern)) { [void]$patterns.Add('invoke') }
  if (Test-Pattern $element ([System.Windows.Automation.ValuePattern]::Pattern)) { [void]$patterns.Add('value') }
  if (Test-Pattern $element ([System.Windows.Automation.SelectionItemPattern]::Pattern)) { [void]$patterns.Add('select') }
  if (Test-Pattern $element ([System.Windows.Automation.TogglePattern]::Pattern)) { [void]$patterns.Add('toggle') }
  if (Test-Pattern $element ([System.Windows.Automation.ExpandCollapsePattern]::Pattern)) { [void]$patterns.Add('expand') }
  if ($patterns.Count -gt 0) { $node.patterns = @($patterns) }
  return [pscustomobject]$node
}

function Add-Tree($element, [string]$ref, [int]$depth) {
  if ($script:Nodes.Count -ge $script:Limit) { return }
  [void]$script:Nodes.Add((Get-Node $element $ref $depth))
  if ($depth -ge $script:MaxDepth) { return }
  $children = Get-Children $element
  for ($i = 0; $i -lt $children.Count; $i += 1) {
    if ($script:Nodes.Count -ge $script:Limit) { return }
    $childRef = if ($ref -eq '') { "$i" } else { "$ref/$i" }
    Add-Tree $children[$i] $childRef ($depth + 1)
  }
}

function Resolve-Ref([string]$path) {
  $element = $script:Desktop
  foreach ($part in $path.Split('/')) {
    if ($part -eq '') { continue }
    $index = 0
    if (-not [int]::TryParse($part, [ref]$index)) {
      Stop-With-Error 'BAD_REF' "ref '$path' is not a path of numbers"
    }
    $children = Get-Children $element
    if ($index -lt 0 -or $index -ge $children.Count) {
      Stop-With-Error 'STALE_REF' "ref '$path' no longer points at anything - snapshot again"
    }
    $element = $children[$index]
  }
  return $element
}

switch ($Command.ToLowerInvariant()) {
  'probe' {
    $count = 0
    foreach ($element in (Get-Children $script:Desktop)) {
      if (Test-Is-Window $element) { $count += 1 }
    }
    Write-Json @{ ok = $true; apps = $count }
    exit 0
  }

  'windows' {
    $list = New-Object System.Collections.ArrayList
    $children = Get-Children $script:Desktop
    for ($i = 0; $i -lt $children.Count; $i += 1) {
      if (-not (Test-Is-Window $children[$i])) { continue }
      $node = Get-Node $children[$i] "$i" 0
      [void]$list.Add([ordered]@{
          index = $i
          name = $node.name
          role = $node.role
          class = $node.class
          processId = $node.processId
          offscreen = $node.offscreen
          bounds = $node.bounds
        })
    }
    Write-Json @{ ok = $true; windows = @($list) }
    exit 0
  }

  'snapshot' {
    if ($App -lt 0) { Stop-With-Error 'BAD_ARGS' 'snapshot needs --app N' }
    if ($Max -lt 1) { $Max = 1 }
    if ($Max -gt 250) { $Max = 250 }
    $script:Limit = $Max
    $children = Get-Children $script:Desktop
    if ($App -ge $children.Count) {
      Stop-With-Error 'STALE_REF' "window $App is gone - ask for the window list again"
    }
    $target = $children[$App]
    Add-Tree $target "$App" 0
    $appName = ''
    try { $appName = [string]$target.Current.Name } catch { }
    Write-Json @{ ok = $true; app = $App; appName = $appName; nodes = @($script:Nodes) }
    exit 0
  }

  'act' {
    if ($Ref -eq '') { Stop-With-Error 'BAD_ARGS' 'act needs --ref from a snapshot' }
    $element = Resolve-Ref $Ref
    if ($Action -eq 'click') {
      $pressed = $false
      try {
        $pattern = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $pattern.Invoke()
        $pressed = $true
      } catch { $pressed = $false }
      if (-not $pressed) {
        try {
          $pattern = $element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
          $pattern.Select()
          $pressed = $true
        } catch { $pressed = $false }
      }
      if (-not $pressed) {
        try {
          $pattern = $element.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
          $pattern.Toggle()
          $pressed = $true
        } catch { $pressed = $false }
      }
      if (-not $pressed) {
        try {
          $pattern = $element.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
          $pattern.Expand()
          $pressed = $true
        } catch { $pressed = $false }
      }
      if (-not $pressed) {
        Stop-With-Error 'NO_ACTION' 'this element publishes no action to press'
      }
      Write-Json @{ ok = $true; ref = $Ref; action = 'click' }
      exit 0
    }
    if ($Action -eq 'settext') {
      try {
        $pattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $pattern.SetValue($Text)
      } catch {
        Stop-With-Error 'NO_VALUE_PATTERN' 'this field cannot be written to through UI Automation'
      }
      Write-Json @{ ok = $true; ref = $Ref; action = 'settext'; length = $Text.Length }
      exit 0
    }
    Stop-With-Error 'BAD_ARGS' "unknown action '$Action'"
  }

  default {
    Stop-With-Error 'BAD_ARGS' 'commands are probe, windows, snapshot, act'
  }
}
