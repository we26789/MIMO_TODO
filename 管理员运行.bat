@echo off
echo ============================================
echo   MIMO TODO - 配置防火墙 (需要管理员权限)
echo ============================================
echo.

netsh advfirewall firewall add rule name="MIMO TODO 3000" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="MIMO TODO 3000-OUT" dir=out action=allow protocol=TCP localport=3000

echo.
echo 防火墙规则添加完成！
echo 现在可以通过 http://172.22.164.119:3000 访问
echo.
pause
