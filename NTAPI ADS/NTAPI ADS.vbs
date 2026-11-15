' NTAPI ADS - silent launcher.
'
' Starts the app with no console window at all, and does not wait for it, so
' nothing on screen can be closed by mistake and take the app down with it.
' Thai instructions live in README.md: this file stays ASCII so it cannot be
' misread when the folder path or the ANSI codepage is Thai.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

base = fso.GetParentFolderName(WScript.ScriptFullName)
exe = base & "\node_modules\electron\dist\electron.exe"

If Not fso.FileExists(exe) Then
  MsgBox "NTAPI ADS dependencies are not installed yet." & vbCrLf & vbCrLf & _
         "Run NTAPI ADS.bat once (or npm install in this folder).", 48, "NTAPI ADS"
  WScript.Quit 1
End If

shell.CurrentDirectory = base
' 0 = hidden window, False = do not wait for the app to exit.
shell.Run """" & exe & """ .", 0, False
