@echo off
echo === Git Push to GitHub ===
cd /d "D:\Web\serveyMKT"
"C:\Program Files\Git\bin\git.exe" add script.js index.html admin.html
"C:\Program Files\Git\bin\git.exe" commit -m "fix: resolve all merge conflicts"
"C:\Program Files\Git\bin\git.exe" push origin main
echo === Done ===
pause
