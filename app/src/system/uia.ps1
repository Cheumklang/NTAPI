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
  [string]$Window = '',
  [string]$Self = '',
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
  # What can be *pressed* is part of the description: the caller is told which
  # actions exist instead of guessing a coordinate. It speaks the same
  # vocabulary as the MSAA tree, so one formatter tells the truth about both.
  $patterns = New-Object System.Collections.ArrayList
  foreach ($pair in @(
    @([System.Windows.Automation.InvokePattern]::Pattern, 'invoke'),
    @([System.Windows.Automation.ValuePattern]::Pattern, 'value'),
    @([System.Windows.Automation.SelectionItemPattern]::Pattern, 'select'),
    @([System.Windows.Automation.TogglePattern]::Pattern, 'toggle'),
    @([System.Windows.Automation.ExpandCollapsePattern]::Pattern, 'expand')
  )) {
    if (Test-Pattern $element $pair[0]) { [void]$patterns.Add($pair[1]) }
  }
  $actions = @()
  foreach ($name in $patterns) { if ($name -ne 'value') { $actions += $name } }
  if ($actions.Count -gt 0) { $node.actions = $actions }
  # A field can be written when it publishes a value; classic Notepad publishes
  # none and still says what it is, so the window class is a second witness.
  if ($patterns -contains 'value') { $node.editable = $true }
  if (-not $node.Contains('editable')) {
    try { if ([string]$node.class -match '^(Edit|RichEdit|RICHEDIT|Scintilla|TextBox)') { $node.editable = $true } } catch { }
  }
  if ($patterns.Count -gt 0) { $node.patterns = @($patterns) }
  return [pscustomobject]$node
}

# A browser's accessibility tree is thousands of nodes deep, and PowerShell
# gives a function a small slice of stack: a recursive walk of a Chromium window
# dies with "Maximum call stack size exceeded" before it reaches the controls.
# The walk keeps its own stack instead, and the limit is unchanged.
function Add-Tree($root, [string]$rootRef, [int]$rootDepth) {
  $stack = New-Object System.Collections.Stack
  $stack.Push(@($root, $rootRef, $rootDepth))
  while ($stack.Count -gt 0) {
    if ($script:Nodes.Count -ge $script:Limit) { return }
    $item = $stack.Pop()
    $element = $item[0]
    $ref = [string]$item[1]
    $depth = [int]$item[2]
    [void]$script:Nodes.Add((Get-Node $element $ref $depth))
    if ($depth -ge $script:MaxDepth) { continue }
    $children = Get-Children $element
    # Pushed in reverse so the list comes out in reading order.
    for ($i = $children.Count - 1; $i -ge 0; $i -= 1) {
      $childRef = if ($ref -eq '') { "$i" } else { "$ref/$i" }
      $stack.Push(@($children[$i], $childRef, ($depth + 1)))
    }
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

# The tolerant twin of Resolve-Ref: a ref that came from the MSAA tree has more
# segments than UI Automation can follow, and that is not an error until the
# other tree has been asked too.
function Resolve-Ref-Or-Null([string]$path) {
  $element = $script:Desktop
  foreach ($part in $path.Split('/')) {
    if ($part -eq '') { continue }
    $index = 0
    if (-not [int]::TryParse($part, [ref]$index)) { return $null }
    $children = Get-Children $element
    if ($index -lt 0 -or $index -ge $children.Count) { return $null }
    $element = $children[$index]
  }
  return $element
}

# Every pattern that means "press this", tried in turn: a button invokes, a
# tab selects, a switch toggles, a folded list expands. Returns $true when one
# of them accepted the request.
function Invoke-Uia-Click($element) {
  if (-not $element) { return $false }
  $attempts = @(
    @([System.Windows.Automation.InvokePattern]::Pattern, 'Invoke'),
    @([System.Windows.Automation.SelectionItemPattern]::Pattern, 'Select'),
    @([System.Windows.Automation.TogglePattern]::Pattern, 'Toggle'),
    @([System.Windows.Automation.ExpandCollapsePattern]::Pattern, 'Expand')
  )
  foreach ($attempt in $attempts) {
    try {
      $pattern = $element.GetCurrentPattern($attempt[0])
      $pattern.GetType().GetMethod($attempt[1]).Invoke($pattern, @()) | Out-Null
      return $true
    } catch { }
  }
  return $false
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
$script:ShotError = ''
try {
  Add-Type -AssemblyName System.Drawing -ErrorAction Stop
} catch {
  $script:ShotError = $_.Exception.Message
}
if (-not $script:ShotError) {
  # Windows PowerShell does not reference System.Drawing for a compiled type by
  # default, which is why the first attempt answered "missing assembly
  # reference"; PowerShell 7 needs the other name for the same thing.
  $added = $false
  foreach ($reference in @('System.Drawing', 'System.Drawing.Common')) {
    if ($added) { break }
    try {
      Add-Type -TypeDefinition $script:ShotSource -ReferencedAssemblies $reference -ErrorAction Stop
      $added = $true
    } catch {
      $script:ShotError = $_.Exception.Message
    }
  }
  if (-not $added -and -not ([System.Management.Automation.PSTypeName] 'NTAPIShot').Type) {
    $script:ShotError = 'the drawing library could not be compiled: ' + $script:ShotError
  }
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
  if (-not (Test-Is-Window $children[$index])) {
    Stop-With-Error 'NOT_A_WINDOW' "$index is not a window - use a number from the window list, or the handle"
  }
  return $children[$index]
}

# An index is a position in a list that shifts whenever a window opens or
# closes; a handle is the window itself. Callers that act later pass the handle.
# The window in front is what a person would act on when nothing is named, so it
# is the default - but never when the window in front is this application itself,
# because typing into the chat is not what "type in the window" means.
function Get-Foreground-Element() {
  $handle = [NTAPIInput]::GetForegroundWindow()
  if ($handle -eq [IntPtr]::Zero) { Stop-With-Error 'NO_FOREGROUND' 'no window is in the foreground' }
  if ($Self -ne '' -and $handle -eq [IntPtr][int64]$Self) {
    Stop-With-Error 'SELF_WINDOW' 'the window in front is NTAPI itself. Say which window to use (app or window from system_windows) and try again.'
  }
  foreach ($candidate in (Get-Children $script:Desktop)) {
    if (-not (Test-Is-Window $candidate)) { continue }
    if ((Get-Window-Handle $candidate) -eq $handle) { return $candidate }
  }
  Stop-With-Error 'NO_FOREGROUND' 'the window in front is not one the accessibility tree lists'
}

function Get-Target-Element() {
  if ($Window -ne '') {
    $wanted = [IntPtr]::Zero
    try { $wanted = [IntPtr][int64]$Window } catch { }
    if ($wanted -ne [IntPtr]::Zero) {
      foreach ($candidate in (Get-Children $script:Desktop)) {
        if (-not (Test-Is-Window $candidate)) { continue }
        if ((Get-Window-Handle $candidate) -eq $wanted) { return $candidate }
      }
      Stop-With-Error 'STALE_REF' "window $Window is gone - ask for the window list again"
    }
    Stop-With-Error 'BAD_ARGS' "window '$Window' is not a window handle"
  }
  if ($App -lt 0) { return Get-Foreground-Element }
  return Get-Window-Element $App
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

if (-not ('NTWin32.WindowRect' -as [type])) {
  Add-Type -Namespace NTWin32 -Name WindowRect -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)]
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
[DllImport("user32.dll")]
public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
[DllImport("user32.dll")]
public static extern bool IsIconic(IntPtr hWnd);
'@
}

# Chrome publishes an empty UI Automation rectangle while it is minimised or
# freshly restored, and a caller that cannot aim cannot click. The window does
# have a rectangle on screen, so ask Windows instead of the accessibility tree.
function Get-Hwnd-Bounds($handle) {
  $hwnd = [IntPtr][int64]$handle
  if ($hwnd -eq [IntPtr]::Zero) { return $null }
  try {
    $rect = New-Object NTWin32.WindowRect+RECT
    if ([NTWin32.WindowRect]::GetWindowRect($hwnd, [ref]$rect)) {
      $w = $rect.Right - $rect.Left
      $h = $rect.Bottom - $rect.Top
      if ($w -gt 0 -and $h -gt 0) {
        $minimised = $false
        try { $minimised = [NTWin32.WindowRect]::IsIconic($hwnd) } catch { }
        return [ordered]@{ x = $rect.Left; y = $rect.Top; w = $w; h = $h; minimised = $minimised }
      }
    }
  } catch { }
  return $null
}

function Get-Window-Bounds($element) {
  try {
    $rect = $element.Current.BoundingRectangle
    if (-not $rect.IsEmpty -and $rect.Width -gt 0 -and $rect.Height -gt 0) { return $rect }
  } catch { }
  Stop-With-Error 'NO_BOUNDS' 'this window reports no bounds, so there is nothing to aim at'
}


# ---------------------------------------------------------------------------
# The accessibility tree of a Chromium window
# ---------------------------------------------------------------------------
# Chrome, Electron and everything built on them answer UI Automation with one
# pane and nothing inside it. The same window does publish a full tree through
# MSAA (the older Windows accessibility interface Chrome implements), so when a
# window turns out to be one opaque pane the walk is repeated over there.
# Compiling the helper costs about a second, so it happens only when needed.

$script:MsaaReady = $false

function Initialize-Msaa {
  if ($script:MsaaReady) { return $true }
  try {
    Add-Type -AssemblyName Accessibility -ErrorAction Stop
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Accessibility;
using System.Windows.Forms;

public class NtMsaaNode {
  public string Path;
  public string Role;
  public string Name;
  public int X; public int Y; public int W; public int H;
  public string Action;
  public string Value;
}

public static class NtMsaa {
  [DllImport("oleacc.dll")]
  private static extern int AccessibleObjectFromWindow(IntPtr hwnd, uint id, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IAccessible ppv);
  [DllImport("oleacc.dll")]
  private static extern int AccessibleChildren(IAccessible acc, int start, int count, [Out] object[] children, out int obtained);

  public static IAccessible Root(IntPtr hwnd) {
    Guid iid = new Guid("618736E0-3C3D-11CF-810C-00AA00389B71");
    IAccessible acc;
    int hr = AccessibleObjectFromWindow(hwnd, 0xFFFFFFFC, ref iid, out acc);
    if (hr != 0) return null;
    return acc;
  }

  private static string Clean(string s) {
    if (s == null) return "";
    return s.Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
  }

  private static string SafeName(IAccessible acc, object child) {
    try { return Clean(acc.get_accName(child)); } catch { return ""; }
  }

  private static string SafeRole(IAccessible acc, object child) {
    try {
      object r = acc.get_accRole(child);
      if (r is int) return ((AccessibleRole)(int)r).ToString();
      return r == null ? "" : r.ToString();
    } catch { return ""; }
  }

  private static string SafeAction(IAccessible acc, object child) {
    try { return Clean(acc.get_accDefaultAction(child)); } catch { return ""; }
  }

  private static string SafeValue(IAccessible acc, object child) {
    try { return Clean(acc.get_accValue(child)); } catch { return ""; }
  }

  private static object[] Kids(IAccessible acc, int count) {
    object[] kids = new object[count];
    int got = 0;
    try { if (AccessibleChildren(acc, 0, count, kids, out got) != 0) return null; } catch { return null; }
    if (got < count) {
      object[] shorter = new object[got];
      Array.Copy(kids, shorter, got);
      return shorter;
    }
    return kids;
  }

  public static List<NtMsaaNode> Walk(IntPtr hwnd, int limit, int maxDepth) {
    var list = new List<NtMsaaNode>();
    IAccessible root = Root(hwnd);
    if (root == null) return list;
    var stack = new Stack<object[]>();
    stack.Push(new object[] { root, (object)0, "", 0 });
    while (stack.Count > 0 && list.Count < limit) {
      object[] item = stack.Pop();
      IAccessible acc = (IAccessible)item[0];
      object child = item[1];
      string path = (string)item[2];
      int depth = (int)item[3];
      var node = new NtMsaaNode();
      node.Path = path == "" ? "0" : path;
      node.Role = SafeRole(acc, child);
      node.Name = SafeName(acc, child);
      node.Action = SafeAction(acc, child);
      node.Value = SafeValue(acc, child);
      try { acc.accLocation(out node.X, out node.Y, out node.W, out node.H, child); } catch { }
      if (node.W < 0) node.W = 0;
      if (node.H < 0) node.H = 0;
      list.Add(node);
      if (depth >= maxDepth) continue;
      int count = 0;
      try { count = acc.accChildCount; } catch { count = 0; }
      if (count <= 0) continue;
      object[] kids = Kids(acc, count);
      if (kids == null) continue;
      for (int i = kids.Length - 1; i >= 0; i -= 1) {
        object kid = kids[i];
        string kpath = (path == "" ? "0" : path) + "/" + i;
        IAccessible asAcc = kid as IAccessible;
        if (asAcc != null) stack.Push(new object[] { asAcc, (object)0, kpath, depth + 1 });
        else stack.Push(new object[] { acc, kid, kpath, depth + 1 });
      }
    }
    return list;
  }

  private static object[] Navigate(IAccessible root, string path) {
    IAccessible acc = root;
    object child = (object)0;
    string[] parts = path.Split('/');
    for (int i = 1; i < parts.Length; i += 1) {
      int index;
      if (!int.TryParse(parts[i], out index)) return null;
      int count = 0;
      try { count = acc.accChildCount; } catch { return null; }
      if (index < 0 || index >= count) return null;
      object[] kids = Kids(acc, count);
      if (kids == null || index >= kids.Length) return null;
      object kid = kids[index];
      IAccessible asAcc = kid as IAccessible;
      if (asAcc != null) { acc = asAcc; child = (object)0; } else { child = kid; }
    }
    return new object[] { acc, child };
  }

  public static bool Press(IntPtr hwnd, string path) {
    IAccessible root = Root(hwnd);
    if (root == null) return false;
    object[] target = Navigate(root, path);
    if (target == null) return false;
    try {
      ((IAccessible)target[0]).accDoDefaultAction(target[1]);
      return true;
    } catch { return false; }
  }

  public static bool SetValue(IntPtr hwnd, string path, string text) {
    IAccessible root = Root(hwnd);
    if (root == null) return false;
    object[] target = Navigate(root, path);
    if (target == null) return false;
    IAccessible acc = (IAccessible)target[0];
    object child = target[1];
    string before = SafeValue(acc, child);
    try {
      acc.set_accValue(child, text);
    } catch { return false; }
    // A field that will not read its own value back cannot confirm anything,
    // and "it probably worked" has already cost a model a whole turn.
    return SafeValue(acc, child) != before;
  }
}
'@ -ReferencedAssemblies Accessibility, System.Windows.Forms -ErrorAction Stop
    $script:MsaaReady = $true
  } catch {
    $script:MsaaReady = $false
  }
  return $script:MsaaReady
}

$script:MsaaRoles = @{
  'PushButton' = 'Button'; 'StaticText' = 'Text'; 'Grouping' = 'Group'; 'Document' = 'Document';
  'Text' = 'Edit'; 'Client' = 'Pane'; 'Link' = 'Hyperlink'; 'CheckButton' = 'CheckBox';
  'RadioButton' = 'RadioButton'; 'ComboBox' = 'ComboBox'; 'List' = 'List'; 'ListItem' = 'ListItem';
  'PageTab' = 'TabItem'; 'PageTabList' = 'Tab'; 'MenuBar' = 'MenuBar'; 'MenuItem' = 'MenuItem';
  'ButtonMenu' = 'MenuButton'; 'Pane' = 'Pane'; 'Window' = 'Window'; 'Image' = 'Image';
  'Border' = 'Pane'; 'ToolBar' = 'ToolBar'; 'Slider' = 'Slider'; 'ScrollBar' = 'ScrollBar';
  'Indicator' = 'ProgressBar'; 'Outline' = 'Tree'; 'OutlineItem' = 'TreeItem'; 'Table' = 'DataGrid'
}

function Convert-Msaa-Role([string]$role) {
  if ($role -eq '') { return 'unknown' }
  if ($script:MsaaRoles.ContainsKey($role)) { return $script:MsaaRoles[$role] }
  return $role
}

# MSAA describes an action as a phrase ("press", "check", "open"); the tools
# describe one as a pattern name, the same words UI Automation uses.
function Convert-Msaa-Actions([string]$action) {
  $list = New-Object System.Collections.ArrayList
  $a = $action.ToLowerInvariant()
  if ($a -eq '') { return , $list }
  if ($a -eq 'click ancestor') { return , $list }
  if ($a.Contains('press') -or $a.Contains('click') -or $a.Contains('double click')) { [void]$list.Add('invoke') }
  if ($a.Contains('check') -or $a.Contains('select')) { [void]$list.Add('toggle') }
  if ($a.Contains('open')) { [void]$list.Add('expand') }
  return , $list
}

function Get-Msaa-Tree($windowElement, [int]$windowIndex, [int]$limit, [int]$maxDepth) {
  $handle = Get-Window-Handle $windowElement
  if ($handle -eq [IntPtr]::Zero) { return $null }
  if (-not (Initialize-Msaa)) { return $null }
  $raw = $null
  try { $raw = [NtMsaa]::Walk($handle, $limit, $maxDepth) } catch { return $null }
  if (-not $raw -or $raw.Count -eq 0) { return $null }
  $nodes = New-Object System.Collections.ArrayList
  foreach ($item in $raw) {
    $role = Convert-Msaa-Role $item.Role
    $node = [ordered]@{
      ref = "$windowIndex"
      depth = 0
      role = $role
      name = $item.Name
      id = ''
      class = $item.Role
      enabled = $true
      offscreen = ($item.W -le 0 -or $item.H -le 0)
    }
    # "0/1/2" from the MSAA root becomes "<window>/1/2" in the tool's refs.
    $suffix = if ($item.Path -eq '0') { '' } else { $item.Path.Substring(1) }
    # The leading "m" is what makes this ref usable later: the two trees count
    # their children differently, so a ref has to say which tree it came from.
    $node.ref = "m$windowIndex$suffix"
    $node.depth = ($suffix.Split('/').Count - 1)
    if ($item.W -gt 0 -and $item.H -gt 0) {
      $node.bounds = [ordered]@{ x = [int]$item.X; y = [int]$item.Y; w = [int]$item.W; h = [int]$item.H }
    }
    $actions = Convert-Msaa-Actions $item.Action
    if ($actions.Count -gt 0) { $node.actions = @($actions) }
    if ($role -eq 'Edit') { $node.editable = $true }
    [void]$nodes.Add($node)
  }
  return $nodes
}

# The window a ref belongs to: every ref starts with the window's own number.
function Get-Window-Handle-From-Ref([string]$path) {
  if ($path.StartsWith('m')) { $path = $path.Substring(1) }
  $children = Get-Children $script:Desktop
  $first = $path.Split('/')[0]
  $index = 0
  if (-not [int]::TryParse($first, [ref]$index)) { return [IntPtr]::Zero }
  if ($index -lt 0 -or $index -ge $children.Count) { return [IntPtr]::Zero }
  return (Get-Window-Handle $children[$index])
}

# A ref from an MSAA snapshot is a path inside that window, one segment shorter
# than the ref the tools print.
function ConvertTo-Msaa-Path([string]$path) {
  if ($path.StartsWith('m')) { $path = $path.Substring(1) }
  $segments = $path.Split('/')
  if ($segments.Count -le 1) { return '0' }
  return '0' + ($segments[1..($segments.Count - 1)] -join '/').Insert(0, '/')
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
    # The window's name is what its title bar says; the program is what tells
    # two windows of the same application apart, so the list carries both.
    $procNames = @{}
    $children = Get-Children $script:Desktop
    for ($i = 0; $i -lt $children.Count; $i += 1) {
      if (-not (Test-Is-Window $children[$i])) { continue }
      $node = Get-Node $children[$i] "$i" 0
      $procId = $node.processId
      $procKey = [string]$procId
      if (-not $procNames.ContainsKey($procKey)) {
        $found = ''
        try { $found = [string](Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { $found = '' }
        $procNames[$procKey] = $found
      }
      $handle = Get-Window-Handle $children[$i]
      $winBounds = $node.bounds
      $minimised = $false
      if (-not $winBounds) {
        $fallback = Get-Hwnd-Bounds $handle
        if ($fallback) {
          # A minimised window sits at -32000,-32000 as a 160x28 stub: real
          # numbers, useless ones. Say it is minimised and leave the bounds out,
          # so nothing aims at a point no click can reach.
          if ($fallback.minimised) {
            $minimised = $true
          } else {
            $winBounds = [ordered]@{ x = $fallback.x; y = $fallback.y; w = $fallback.w; h = $fallback.h }
          }
        }
      }
      [void]$list.Add([ordered]@{
          index = $i
          name = $node.name
          role = $node.role
          class = $node.class
          processId = $procId
          process = $procNames[$procKey]
          handle = $handle
          offscreen = $node.offscreen
          minimised = $minimised
          bounds = $winBounds
        })
    }
    Write-Json @{ ok = $true; windows = @($list) }
    exit 0
  }

  'snapshot' {
    if ($App -lt 0 -and $Window -eq '') { Stop-With-Error 'BAD_ARGS' 'snapshot needs --app N or --window HANDLE' }
    if ($Max -lt 1) { $Max = 1 }
    if ($Max -gt 250) { $Max = 250 }
    $script:Limit = $Max
    # Not $target: that name is a [string] parameter of this script and
    # PowerShell would quietly store the element's ToString() instead.
    $windowElement = Get-Target-Element
    $index = $App
    $children = Get-Children $script:Desktop
    # A handle names the window, but the refs inside a tree are numbers, so the
    # window's own position has to be found before the walk starts.
    $wantedHandle = Get-Window-Handle $windowElement
    for ($i = 0; $i -lt $children.Count; $i += 1) {
      if ([object]::ReferenceEquals($children[$i], $windowElement)) { $index = $i; break }
      if ($wantedHandle -ne [IntPtr]::Zero) {
        if ((Get-Window-Handle $children[$i]) -eq $wantedHandle) { $index = $i; break }
      }
    }
    Add-Tree $windowElement "$index" 0
    $appName = ''
    try { $appName = [string]$windowElement.Current.Name } catch { }
    # Chrome and everything built on it answer UI Automation with the window and
    # one render pane, and the controls live in the MSAA tree of the same
    # window. Two nodes is the shape of that answer, so it is also the cue.
    $provider = 'uia'
    $useful = 0
    foreach ($node in $script:Nodes) {
      if ($node.actions -or $node.editable) { $useful += 1 }
    }
    # Chrome answers UI Automation with the window and one render pane, and
    # classic Notepad with three panes and no field at all: both say the real
    # controls live somewhere else, so the MSAA tree of the same window is
    # asked too. Two nodes is the first shape of that answer, nothing usable
    # in the whole tree is the second.
    if ($script:Nodes.Count -le 2 -or $useful -eq 0) {
      $msaa = Get-Msaa-Tree $windowElement $index $script:Limit $script:MaxDepth
      if ($msaa -and $msaa.Count -gt $script:Nodes.Count) {
        $script:Nodes = $msaa
        $provider = 'msaa'
      }
    }
    Write-Json @{ ok = $true; app = $index; appName = $appName; handle = (Get-Window-Handle $windowElement); provider = $provider; nodes = @($script:Nodes) }
    exit 0
  }

  'act' {
    if ($Ref -eq '') { Stop-With-Error 'BAD_ARGS' 'act needs --ref from a snapshot' }
    $fromMsaa = $Ref.StartsWith('m')
    $element = if ($fromMsaa) { $null } else { Resolve-Ref-Or-Null $Ref }
    if ($Action -eq 'click') {
      $pressed = Invoke-Uia-Click $element
      $via = 'uia'
      if (-not $pressed) {
        # A control whose tree came from MSAA cannot be invoked through UI
        # Automation patterns: press it the way that tree describes it.
        if ($fromMsaa) { $windowHandle = Get-Window-Handle-From-Ref $Ref } else { $windowHandle = [IntPtr]::Zero }
        if ($windowHandle -ne [IntPtr]::Zero -and (Initialize-Msaa)) {
          $msaaPath = ConvertTo-Msaa-Path $Ref
          try { $pressed = [NtMsaa]::Press($windowHandle, $msaaPath) } catch { $pressed = $false }
          if ($pressed) { $via = 'msaa' }
        }
      }
      if (-not $pressed) {
        Stop-With-Error 'NO_ACTION' 'this element publishes no action to press'
      }
      Write-Json @{ ok = $true; ref = $Ref; action = 'click'; via = $via }
      exit 0
    }
    if ($Action -eq 'settext') {
      $written = $false
      $via = 'uia'
      if ($element) {
        try {
          $pattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
          $pattern.SetValue($Text)
          $written = $true
        } catch { $written = $false }
      }
      if (-not $written) {
        if ($fromMsaa) { $windowHandle = Get-Window-Handle-From-Ref $Ref } else { $windowHandle = [IntPtr]::Zero }
        if ($windowHandle -ne [IntPtr]::Zero -and (Initialize-Msaa)) {
          try { $written = [NtMsaa]::SetValue($windowHandle, (ConvertTo-Msaa-Path $Ref), $Text) } catch { $written = $false }
          if ($written) { $via = 'msaa' }
        }
      }
      if (-not $written) {
        Stop-With-Error 'NO_VALUE_PATTERN' 'this field cannot be written to through UI Automation - focus its window and use system_type to type it for real'
      }
      Write-Json @{ ok = $true; ref = $Ref; action = 'settext'; via = $via; length = $Text.Length }
      exit 0
    }
    Stop-With-Error 'BAD_ARGS' "unknown action '$Action'"
  }

  'focus' {
    if ($App -lt 0 -and $Window -eq '') { Stop-With-Error 'BAD_ARGS' 'focus needs --app N or --window HANDLE' }
    $element = Get-Target-Element
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
    if ($App -lt 0 -and $Window -eq '') { Stop-With-Error 'BAD_ARGS' 'keys needs --app N or --window HANDLE' }
    if ($Keys -eq '') { Stop-With-Error 'BAD_ARGS' 'keys needs --keys, for example ctrl+s' }
    $element = Get-Target-Element
    [void](Focus-Window $element)
    [void](Focus-Text-Control $element)
    [NTAPIInput]::Reset()
    Send-Combo $Keys
    if ([NTAPIInput]::Failed -gt 0) {
      Stop-With-Error 'INPUT_REJECTED' ("Windows rejected the key events (error " + [NTAPIInput]::LastError + "). A window running as administrator ignores input from a normal program; nothing was pressed.")
    }
    Write-Json @{ ok = $true; app = $App; appName = (Get-Window-Name $element); handle = (Get-Window-Handle $element); did = ('pressed ' + $Keys); method = 'sendinput' }
    exit 0
  }

  'type' {
    if ($App -lt 0 -and $Window -eq '') { Stop-With-Error 'BAD_ARGS' 'type needs --app N or --window HANDLE' }
    if ($Text -eq '') { Stop-With-Error 'BAD_ARGS' 'type needs --text' }
    $element = Get-Target-Element
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
      Write-Json @{ ok = $true; app = $App; did = ('sent ' + $Text.Length + ' characters'); method = $method; verified = $false; checked = $false; control = $controlName; beforeLen = $beforeLen; afterLen = $afterLen; sendInput = [NTAPIInput]::LastSend; lastError = [NTAPIInput]::LastError }
      exit 0
    }
    if (-not $verified) {
      if ([NTAPIInput]::Failed -gt 0) {
        Stop-With-Error 'INPUT_REJECTED' ("Windows rejected " + [NTAPIInput]::Failed + " of the key events (error " + [NTAPIInput]::LastError + "). A window running as administrator ignores input from a normal program, so nothing was typed.")
      }
      Stop-With-Error 'TYPE_NOT_DELIVERED' ("the text was sent three ways and the control '" + $controlName + "' did not change. Click into the text area and try again.")
    }
    Write-Json @{ ok = $true; app = $App; appName = (Get-Window-Name $element); handle = (Get-Window-Handle $element); did = ('typed ' + $Text.Length + ' characters'); method = $method; verified = $true; checked = $true; control = $controlName; beforeLen = $beforeLen; afterLen = $afterLen }
    exit 0
  }

  'screenshot' {
    if ($App -lt 0 -and $Window -eq '') { Stop-With-Error 'BAD_ARGS' 'screenshot needs --app N or --window HANDLE' }
    if ($script:ShotError) { Stop-With-Error 'NO_SHOT_API' ("the drawing library is unavailable: " + $script:ShotError) }
    $element = Get-Target-Element
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
    if ($App -lt 0 -and $Window -eq '') { Stop-With-Error 'BAD_ARGS' 'clickat needs --app N or --window HANDLE' }
    $element = Get-Target-Element
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
    if ($App -lt 0 -and $Window -eq '') { Stop-With-Error 'BAD_ARGS' 'scroll needs --app N or --window HANDLE' }
    $element = Get-Target-Element
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
