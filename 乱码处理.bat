@echo off
chcp 65001 > nul

:: 注意 Get-Content 命令被圆括号括起来了
powershell -Command "(Get-Content -Path .\\data.csv) | Set-Content -Path .\\data.csv -Encoding UTF8"

echo.
echo data.csv 已成功转换为 UTF-8 编码。
echo.
pause