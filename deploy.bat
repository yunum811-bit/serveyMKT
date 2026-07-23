@echo off
echo === Git Push to GitHub ===
cd /d "D:\Web\serveyMKT"
"C:\Program Files\Git\bin\git.exe" add script.js index.html admin.html
"C:\Program Files\Git\bin\git.exe" status
"C:\Program Files\Git\bin\git.exe" diff --cached --stat
"C:\Program Files\Git\bin\git.exe" commit -m "fix: role-based supervisor per user role" --allow-empty
"C:\Program Files\Git\bin\git.exe" push origin main
echo === Done ===
pause
