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
  focus --app N                bring a window to the front
  launch --target PATH|URL     start a program, document or url, then report its window
  keys --app N --keys ctrl+s   press a shortcut in the focused window
  type --app N --text T        type text one character at a time
  clickat --app N --x X --y Y  click a screen position inside that window
  scroll --app N --delta N     wheel over the middle of that window

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
  [string]$Text = '',
  [string]$Keys = '',
  [string]$Target = '',
  [int]$X = 0,
  [int]$Y = 0,
  [int]$Delta = 0
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

# ---------------------------------------------------------------------------
# Real input: keys, text and the pointer.
#
# UI Automation can only press a control that publishes an action, which covers
# buttons but not a canvas, a shortcut, or a click on something that publishes
# nothing. Those need the same input API the keyboard and mouse themselves use,
# so the helper calls SendInput - and every command below brings the target
# window to the front and checks that it really got there before sending a key.
# ---------------------------------------------------------------------------
$script:InputSource = @'
using System;
using System.Runtime.InteropServices;
public static class NTAPIInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)]
  public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public INPUTUNION u; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, IntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int cmd);

  // SendInput answers with the number of events it accepted. Zero means nothing
  // was typed, and the reason is in GetLastError - so it is kept, not swallowed.
  public static uint LastSend = 0;
  public static int LastError = 0;
  public static int Failed = 0;

  public static void Reset() { LastSend = 0; LastError = 0; Failed = 0; }

  public static void Key(ushort vk, bool up) {
    INPUT[] one = new INPUT[1];
    one[0].type = 1;
    one[0].u.ki.wVk = vk;
    one[0].u.ki.dwFlags = up ? 2u : 0u;
    LastSend = SendInput(1, one, Marshal.SizeOf(typeof(INPUT)));
    if (LastSend == 0) { Failed++; LastError = Marshal.GetLastWin32Error(); }
  }

  // One UTF-16 unit per event with the UNICODE flag: this types what the user
  // meant, whatever keyboard layout the machine happens to have.
  public static void Text(string text) {
    foreach (char c in text) {
      INPUT[] pair = new INPUT[2];
      pair[0].type = 1; pair[0].u.ki.wVk = 0; pair[0].u.ki.wScan = (ushort)c; pair[0].u.ki.dwFlags = 4u;
      pair[1].type = 1; pair[1].u.ki.wVk = 0; pair[1].u.ki.wScan = (ushort)c; pair[1].u.ki.dwFlags = 6u;
      LastSend = SendInput(2, pair, Marshal.SizeOf(typeof(INPUT)));
      if (LastSend == 0) { Failed++; LastError = Marshal.GetLastWin32Error(); }
    }
  }

  public static void Click(int x, int y, bool right) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(30);
    mouse_event(right ? 0x0008u : 0x0002u, 0, 0, 0, IntPtr.Zero);
    mouse_event(right ? 0x0010u : 0x0004u, 0, 0, 0, IntPtr.Zero);
  }

  public static void Wheel(int delta) {
    mouse_event(0x0800u, 0, 0, delta, IntPtr.Zero);
  }
}
'@
# Photographing a window that is not ours. PrintWindow asks the window to draw
# itself into a bitmap, which works even when another window covers it; when a
# window refuses, CopyFromScreen is the honest fallback and the answer says so.
$script:ShotSource = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class NTAPIShot {
  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);

  public static bool Print(IntPtr hwnd, int width, int height, string path) {
    using (Bitmap bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb))
    using (Graphics g = Graphics.FromImage(bmp)) {
      IntPtr hdc = g.GetHdc();
      bool ok = PrintWindow(hwnd, hdc, 2);
      if (!ok) { ok = PrintWindow(hwnd, hdc, 0); }
      g.ReleaseHdc(hdc);
      bmp.Save(path, ImageFormat.Png);
      return ok;
    }
  }

  public static void Screen(int x, int y, int width, int height, string path) {
    using (Bitmap bmp = new Bitmap(width, height, PixelFormat.Format32bppArgb))
    using (Graphics g = Graphics.FromImage(bmp)) {
      g.CopyFromScreen(x, y, 0, 0, new Size(width, height));
      bmp.Save(path, ImageFormat.Png);
    }
  }
}
'@
try {
  Add-Type -AssemblyName System.Drawing -ErrorAction Stop
  Add-Type -TypeDefinition $script:ShotSource -ErrorAction Stop
} catch {
  $script:ShotError = $_.Exception.Message
}

try {
  Add-Type -TypeDefinition $script:InputSource -ErrorAction Stop
} catch {
  if (-not ([System.Management.Automation.PSTypeName] 'NTAPIInput').Type) {
    Stop-With-Error 'NO_INPUT_API' "the Windows input API is unavailable: $($_.Exception.Message)"
  }
}

# Virtual-key codes for the names a model is likely to say.
$script:Vk = @{
  'backspace' = 0x08; 'tab' = 0x09; 'enter' = 0x0D; 'return' = 0x0D; 'shift' = 0x10
  'ctrl' = 0x11; 'control' = 0x11; 'alt' = 0x12; 'pause' = 0x13; 'capslock' = 0x14
  'escape' = 0x1B; 'esc' = 0x1B; 'space' = 0x20; 'pageup' = 0x21; 'pagedown' = 0x22
  'end' = 0x23; 'home' = 0x24; 'left' = 0x25; 'up' = 0x26; 'right' = 0x27; 'down' = 0x28
  'insert' = 0x2D; 'delete' = 0x2E; 'win' = 0x5B; 'meta' = 0x5B
  '`' = 0xC0; '-' = 0xBD; '=' = 0xBB; '[' = 0xDB; ']' = 0xDD; '\' = 0xDC
  ';' = 0xBA; "'" = 0xDE; ',' = 0xBC; '.' = 0xBE; '/' = 0xBF
}
for ($i = 0; $i -lt 26; $i += 1) { $script:Vk[[string][char](97 + $i)] = 0x41 + $i }
for ($i = 0; $i -lt 10; $i += 1) { $script:Vk["$i"] = 0x30 + $i }
for ($i = 1; $i -le 24; $i += 1) { $script:Vk["f$i"] = 0x70 + ($i - 1) }

function Resolve-Vk([string]$name) {
  $key = $name.Trim().ToLowerInvariant()
  if ($key -eq '') { return -1 }
  if ($script:Vk.ContainsKey($key)) { return [int]$script:Vk[$key] }
  return -1
}

function Send-Combo([string]$spec) {
  $parts = @($spec.Split('+') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
  if ($parts.Count -eq 0) { Stop-With-Error 'BAD_ARGS' 'keys needs at least one key, for example ctrl+s' }
  $codes = New-Object System.Collections.ArrayList
  foreach ($part in $parts) {
    $code = Resolve-Vk $part
    if ($code -lt 0) { Stop-With-Error 'BAD_ARGS' "unknown key '$part'" }
    [void]$codes.Add($code)
  }
  # Down in order, up in reverse: the modifier has to be held while the last key
  # goes down, and released after it.
  foreach ($code in $codes) { [NTAPIInput]::Key([uint16]$code, $false) }
  Start-Sleep -Milliseconds 25
  for ($i = $codes.Count - 1; $i -ge 0; $i -= 1) { [NTAPIInput]::Key([uint16]$codes[$i], $true) }
}

function Get-Window-Element([int]$index) {
  $children = Get-Children $script:Desktop
  if ($index -lt 0 -or $index -ge $children.Count) {
    Stop-With-Error 'STALE_REF' "window $index is gone - ask for the window list again"
  }
  return $children[$index]
}

function Get-Window-Handle($element) {
  try {
    return [IntPtr][int]$element.Current.NativeWindowHandle
  } catch {
    return [IntPtr]::Zero
  }
}

function Get-Window-Name($element) {
  try {
    return [string]$element.Current.Name
  } catch {
    return ''
  }
}

# Bring the window to the front and refuse to type into anything else. The check
# is the safety rail: a keystroke aimed at one application must never land in
# another, and Windows is free to ignore a focus request.
function Focus-Window($element) {
  $handle = Get-Window-Handle $element
  if ($handle -eq [IntPtr]::Zero) {
    Stop-With-Error 'NO_WINDOW_HANDLE' 'this window has no native handle to focus'
  }
  if ([NTAPIInput]::GetForegroundWindow() -eq $handle) { return $handle }
  try { [void][NTAPIInput]::ShowWindow($handle, 9) } catch { }
  [void][NTAPIInput]::SetForegroundWindow($handle)
  Start-Sleep -Milliseconds 150
  if ([NTAPIInput]::GetForegroundWindow() -ne $handle) {
    Stop-With-Error 'NOT_FOREGROUND' ("Windows would not bring '" + (Get-Window-Name $element) + "' to the front. Ask the user to click that window, then try again.")
  }
  return $handle
}

# A window in front is not a window whose text area has the caret, which is why
# keys can arrive nowhere. Find the control that takes text, give it the caret,
# and when it refuses that, click into it - the same thing a person does.
function Get-Text-Control($element) {
  try {
    $scope = [System.Windows.Automation.TreeScope]::Descendants
    $edit = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
    $target = $element.FindFirst($scope, $edit)
    if ($null -eq $target) {
      $document = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)
      $target = $element.FindFirst($scope, $document)
    }
    return $target
  } catch { }
  return $null
}

function Focus-Text-Control($element) {
  $target = Get-Text-Control $element
  if ($null -eq $target) { return $null }
  try {
    $target.SetFocus()
    Start-Sleep -Milliseconds 100
  } catch { }
  $here = $null
  try { $here = [System.Windows.Automation.AutomationElement]::FocusedElement } catch { }
  $inside = $false
  try {
    if ($null -ne $here -and $here.Current.ProcessId -eq $element.Current.ProcessId) { $inside = $true }
  } catch { }
  if (-not $inside) {
    try {
      $rect = $target.Current.BoundingRectangle
      if ((-not $rect.IsEmpty) -and $rect.Width -gt 6 -and $rect.Height -gt 6) {
        $x = [int]($rect.X + [Math]::Min(40, $rect.Width / 2))
        $y = [int]($rect.Y + [Math]::Min(20, $rect.Height / 2))
        [NTAPIInput]::Click($x, $y, $false)
        Start-Sleep -Milliseconds 180
      }
    } catch { }
  }
  return $target
}

# What the control holds right now, read through the accessibility layer: the
# only way to tell "typed" from "hoped".
function Get-Control-Text($control) {
  if ($null -eq $control) { return $null }
  try {
    $pattern = $null
    if ($control.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
      return [string]$pattern.Current.Value
    }
    if ($control.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
      return [string]$pattern.DocumentRange.GetText(8192)
    }
  } catch { }
  return $null
}

function Get-Window-Bounds($element) {
  try {
    $rect = $element.Current.BoundingRectangle
    if (-not $rect.IsEmpty) { return $rect }
  } catch { }
  Stop-With-Error 'NO_BOUNDS' 'this window reports no bounds, so there is nothing to aim at'
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

  'focus' {
    if ($App -lt 0) { Stop-With-Error 'BAD_ARGS' 'focus needs --app N' }
    $element = Get-Window-Element $App
    [void](Focus-Window $element)
    Write-Json @{ ok = $true; app = $App; appName = (Get-Window-Name $element); did = ('focused ' + (Get-Window-Name $element)) }
    exit 0
  }

  'launch' {
    if ($Target -eq '') { Stop-With-Error 'BAD_ARGS' 'launch needs --target: an executable, a document or a url' }
    $before = @{}
    foreach ($element in (Get-Children $script:Desktop)) {
      try { $before[[string]$element.Current.NativeWindowHandle] = $true } catch { }
    }
    try {
      Start-Process -FilePath $Target | Out-Null
    } catch {
      Stop-With-Error 'NO_LAUNCH' ("could not start '" + $Target + "': " + $_.Exception.Message)
    }
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 400
      $children = Get-Children $script:Desktop
      for ($i = 0; $i -lt $children.Count; $i += 1) {
        $handle = ''
        try { $handle = [string]$children[$i].Current.NativeWindowHandle } catch { }
        if ($handle -eq '' -or $before.ContainsKey($handle)) { continue }
        if (-not (Test-Is-Window $children[$i])) { continue }
        $name = Get-Window-Name $children[$i]
        if ($name -eq '') { continue }
        Write-Json @{ ok = $true; app = $i; appName = $name; did = ('started ' + $Target) }
        exit 0
      }
    }
    Write-Json @{ ok = $true; app = -1; appName = ''; did = ('started ' + $Target + ' but no window appeared yet') }
    exit 0
  }

  'keys' {
    if ($App -lt 0) { Stop-With-Error 'BAD_ARGS' 'keys needs --app N' }
    if ($Keys -eq '') { Stop-With-Error 'BAD_ARGS' 'keys needs --keys, for example ctrl+s' }
    $element = Get-Window-Element $App
    [void](Focus-Window $element)
    [void](Focus-Text-Control $element)
    [NTAPIInput]::Reset()
    Send-Combo $Keys
    if ([NTAPIInput]::Failed -gt 0) {
      Stop-With-Error 'INPUT_REJECTED' ("Windows rejected the key events (error " + [NTAPIInput]::LastError + "). A window running as administrator ignores input from a normal program; nothing was pressed.")
    }
    Write-Json @{ ok = $true; app = $App; did = ('pressed ' + $Keys); method = 'sendinput' }
    exit 0
  }

  'type' {
    if ($App -lt 0) { Stop-With-Error 'BAD_ARGS' 'type needs --app N' }
    if ($Text -eq '') { Stop-With-Error 'BAD_ARGS' 'type needs --text' }
    $element = Get-Window-Element $App
    [void](Focus-Window $element)
    $control = Focus-Text-Control $element
    if ($null -eq $control) {
      try { $control = [System.Windows.Automation.AutomationElement]::FocusedElement } catch { }
    }
    $before = Get-Control-Text $control
    [NTAPIInput]::Reset()
    [NTAPIInput]::Text($Text)
    Start-Sleep -Milliseconds 200
    $after = Get-Control-Text $control
    $method = 'sendinput'
    $verified = $false
    if (($null -ne $before) -and ($null -ne $after) -and ($after -ne $before)) { $verified = $true }

    if ((-not $verified) -and ($null -ne $control)) {
      # Second way: write the text straight into the control.
      try {
        $pattern = $null
        if ($control.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
          $pattern.SetValue([string]$pattern.Current.Value + $Text)
          Start-Sleep -Milliseconds 150
          if ((Get-Control-Text $control) -ne $before) { $verified = $true; $method = 'value-pattern' }
        }
      } catch { }
    }

    if ((-not $verified) -and ($null -ne $before)) {
      # Third way: the clipboard. A paste needs no caret in the right place.
      try {
        Set-Clipboard -Value $Text
        Start-Sleep -Milliseconds 150
        Send-Combo 'ctrl+v'
        Start-Sleep -Milliseconds 350
        if ((Get-Control-Text $control) -ne $before) { $verified = $true; $method = 'clipboard-paste' }
      } catch { }
    }

    $controlName = ''
    try { $controlName = [string]$control.Current.ClassName } catch { }
    # The lengths are the evidence: a control that grew by the number of
    # characters sent really received them.
    $beforeLen = -1
    if ($null -ne $before) { $beforeLen = ([string]$before).Length }
    $afterLen = -1
    $afterNow = Get-Control-Text $control
    if ($null -ne $afterNow) { $afterLen = ([string]$afterNow).Length }
    if ($null -eq $before) {
      # There is nothing to read back, so the result says exactly that instead of
      # claiming the text arrived.
      Write-Json @{ ok = $true; app = $App; did = ('sent ' + $Text.Length + ' characters'); method = $method; verified = $false; control = $controlName; beforeLen = $beforeLen; afterLen = $afterLen; sendInput = [NTAPIInput]::LastSend; lastError = [NTAPIInput]::LastError }
      exit 0
    }
    if (-not $verified) {
      if ([NTAPIInput]::Failed -gt 0) {
        Stop-With-Error 'INPUT_REJECTED' ("Windows rejected " + [NTAPIInput]::Failed + " of the key events (error " + [NTAPIInput]::LastError + "). A window running as administrator ignores input from a normal program, so nothing was typed.")
      }
      Stop-With-Error 'TYPE_NOT_DELIVERED' ("the text was sent three ways and the control '" + $controlName + "' did not change. Click into the text area and try again.")
    }
    Write-Json @{ ok = $true; app = $App; did = ('typed ' + $Text.Length + ' characters'); method = $method; verified = $true; control = $controlName; beforeLen = $beforeLen; afterLen = $afterLen }
    exit 0
  }

  'screenshot' {
    if ($App -lt 0) { Stop-With-Error 'BAD_ARGS' 'screenshot needs --app N' }
    if ($script:ShotError) { Stop-With-Error 'NO_SHOT_API' ("the drawing library is unavailable: " + $script:ShotError) }
    $element = Get-Window-Element $App
    $handle = Get-Window-Handle $element
    if ($handle -eq [IntPtr]::Zero) { Stop-With-Error 'NO_WINDOW_HANDLE' 'this window has no native handle to photograph' }
    $rect = Get-Window-Bounds $element
    $width = [int]$rect.Width
    $height = [int]$rect.Height
    if ($width -lt 8 -or $height -lt 8) { Stop-With-Error 'NO_BOUNDS' 'this window reports no size, so there is nothing to photograph' }
    $path = Join-Path $env:TEMP ('ntapi-shot-' + [Guid]::NewGuid().ToString('N') + '.png')
    $method = 'printwindow'
    $drawn = [NTAPIShot]::Print($handle, $width, $height, $path)
    if (-not $drawn) {
      # Nothing came back from PrintWindow, so take the pixels that are on screen.
      $method = 'screen'
      [NTAPIShot]::Screen([int]$rect.X, [int]$rect.Y, $width, $height, $path)
    }
    if (-not (Test-Path $path)) { Stop-With-Error 'SHOT_FAILED' 'the picture could not be written' }
    Write-Json @{ ok = $true; app = $App; title = (Get-Window-Name $element); path = $path; width = $width; height = $height; method = $method }
    exit 0
  }

  'clickat' {
    if ($App -lt 0) { Stop-With-Error 'BAD_ARGS' 'clickat needs --app N' }
    $element = Get-Window-Element $App
    $rect = Get-Window-Bounds $element
    # Screen coordinates, and they must land inside the window: a click aimed at
    # one application is never delivered to whatever else is on screen.
    if ($X -lt [int]$rect.X -or $Y -lt [int]$rect.Y -or
        $X -ge ([int]$rect.X + [int]$rect.Width) -or $Y -ge ([int]$rect.Y + [int]$rect.Height)) {
      Stop-With-Error 'OUT_OF_BOUNDS' ("$X,$Y is outside the window, which spans " + [int]$rect.X + "," + [int]$rect.Y + " to " + [int]($rect.X + $rect.Width) + "," + [int]($rect.Y + $rect.Height))
    }
    [void](Focus-Window $element)
    [NTAPIInput]::Click($X, $Y, ($Action -eq 'rightclick'))
    Write-Json @{ ok = $true; app = $App; did = ("clicked $X,$Y"); action = $Action }
    exit 0
  }

  'scroll' {
    if ($App -lt 0) { Stop-With-Error 'BAD_ARGS' 'scroll needs --app N' }
    $element = Get-Window-Element $App
    $rect = Get-Window-Bounds $element
    [void](Focus-Window $element)
    # The wheel goes to whatever is under the pointer, not to the focused window,
    # so the pointer is parked in the middle of the target first.
    [void][NTAPIInput]::SetCursorPos([int]($rect.X + $rect.Width / 2), [int]($rect.Y + $rect.Height / 2))
    Start-Sleep -Milliseconds 80
    $notches = $Delta
    if ($notches -eq 0) { $notches = 3 }
    $step = 120
    $remaining = [Math]::Abs($notches)
    $signature = 1
    if ($notches -lt 0) { $signature = -1 }
    while ($remaining -gt 0) {
      [NTAPIInput]::Wheel($signature * $step)
      $remaining -= 1
      Start-Sleep -Milliseconds 40
    }
    Write-Json @{ ok = $true; app = $App; did = ("scrolled $notches notches") }
    exit 0
  }

  default {
    Stop-With-Error 'BAD_ARGS' 'commands are probe, windows, snapshot, act, focus, launch, keys, type, clickat, scroll'
  }
}
