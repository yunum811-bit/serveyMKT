@echo off
echo === Git Push to GitHub ===
cd /d "D:\Web\serveyMKT"
"C:\Program Files\Git\bin\git.exe" add script.js index.html
"C:\Program Files\Git\bin\git.exe" commit -m "fix: resolve merge conflicts in script.js and index.html"
"C:\Program Files\Git\bin\git.exe" push origin main
echo === Done ===
pause
