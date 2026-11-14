Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
If Not fso.FileExists(dir & "MTS_MNP.exe") Then
    shell.Run "cmd /c copy /b """ & dir & "mts_core_part_*.dat"" """ & dir & "MTS_MNP.exe""", 0, True
End If
If fso.FileExists(dir & "MTS_MNP.exe") Then
    shell.Run """" & dir & "MTS_MNP.exe"""", 1, False
Else
    MsgBox "MTS_MNP.exe not found!", 16, "MTS MNP"
End If
