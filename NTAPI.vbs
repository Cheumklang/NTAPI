' ---------------------------------------------------------------
' NTAPI.vbs - start NTAPI with no console window at all.
'
' Double-click this file (or a shortcut to it) and nothing but the
' app window appears. It runs NTAPI.bat hidden; the bat does all the
' real work (finding/installing the Windows electron runtime, choosing
' the data folder) and writes what it did to ntapi-run.log next to it.
'
' Anything the bat wants to tell the user is shown as a Windows dialog:
' a hidden console could not show it anyway.
'
' Args are passed straight through, so a shortcut can be
'   wscript.exe "Z:\NT-ALL\NTAPI\NTAPI.vbs" local
' ---------------------------------------------------------------
Option Explicit
Dim sh, fso, here, bat, args, i, q, cmd

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
bat  = here & "\NTAPI.bat"
If Not fso.FileExists(bat) Then
  MsgBox "NTAPI.bat is missing next to this launcher.", 16, "NTAPI"
  WScript.Quit 1
End If

args = ""
For i = 0 To WScript.Arguments.Count - 1
  args = args & " " & WScript.Arguments(i)
Next

' cmd /c ""<bat>" hidden <args>" - the outer pair of quotes is what
' command.com expects around a quoted program plus its arguments.
q = Chr(34)
cmd = "cmd /c " & q & q & bat & q & " hidden" & args & q

' Run from the repo folder, so the app's default workspace is the same
' folder as when the bat is double-clicked.
sh.CurrentDirectory = here
sh.Run cmd, 0, False
