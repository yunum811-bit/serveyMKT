@echo off
echo === Git Push to GitHub ===
cd /d "D:\Web\serveyMKT"
"C:\Program Files\Git\bin\git.exe" remote set-url origin https://yunum811-bit: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@github.com/yunum811-bit/serveyMKT.git
"C:\Program Files\Git\bin\git.exe" add script.js index.html
"C:\Program Files\Git\bin\git.exe" commit -m "fix: resolve merge conflicts in script.js and index.html" --allow-empty
"C:\Program Files\Git\bin\git.exe" push origin main
echo === Done ===
pause
