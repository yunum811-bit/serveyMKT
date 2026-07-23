@echo off
echo === Git Push to GitHub ===
cd /d "D:\Web\serveyMKT"
"C:\Program Files\Git\bin\git.exe" remote set-url origin https://yunum811-bit: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@github.com/yunum811-bit/serveyMKT.git
"C:\Program Files\Git\bin\git.exe" add -A
"C:\Program Files\Git\bin\git.exe" commit -m "fix: resolve all merge conflicts" --allow-empty
"C:\Program Files\Git\bin\git.exe" push origin main
echo === Done ===
pause
