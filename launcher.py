import subprocess
import webbrowser
import time
import os
import sys

# 切换到项目目录
os.chdir(r'c:\Users\陈\Desktop\cursor\MIMO_TODO')

# 启动服务器（后台）
server = subprocess.Popen(
    ['node', 'server.js'],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    creationflags=subprocess.CREATE_NO_WINDOW
)

# 等待服务器启动
time.sleep(3)

# 打开浏览器
webbrowser.open('http://localhost:3000')

# 保持脚本运行，服务器停止时退出
server.wait()
