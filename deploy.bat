@echo off
echo === Git Push to GitHub ===
cd /d "D:\Web\serveyMKT"
"C:\Program Files\Git\bin\git.exe" config credential.helper store
echo https://yunum811-bit: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@github.com > "%USERPROFILE%\.git-credentials"
"C:\Program Files\Git\bin\git.exe" remote set-url origin https://github.com/yunum811-bit/serveyMKT.git
"C:\Program Files\Git\bin\git.exe" add script.js index.html admin.html
"C:\Program Files\Git\bin\git.exe" commit -m "fix: resolve all merge conflicts" --allow-empty
"C:\Program Files\Git\bin\git.exe" push origin main
echo === Done ===
pause
