@echo off
echo 正在当前目录执行 node server.js...
echo 当前目录: %cd%
echo.

:: 检查node是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo 错误: 未找到Node.js。请先安装Node.js并确保它已添加到系统PATH中。
    pause
    exit /b 1
)

:: 检查server.js是否存在
if not exist "server.js" (
    echo 错误: 在当前目录未找到server.js文件。
    pause
    exit /b 1
)

:: 执行node server.js
node server.js

:: 如果程序退出，等待用户确认
echo.
echo 程序已退出。
pause
    