Set WshShell = CreateObject("WScript.Shell")
' 运行启动脚本，隐藏窗口
WshShell.Run chr(34) & WScript.ScriptFullName & "\..\启动MIMO-TODO.bat" & chr(34), 0, False
' 等待服务器启动
WScript.Sleep 3000
' 打开浏览器
WshShell.Run "http://localhost:3000"
