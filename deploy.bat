@echo off
echo === Git Push to GitHub ===
cd /d "D:\Web\serveyMKT"
"C:\Program Files\Git\bin\git.exe" pull https://yunum811-bit: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@github.com/yunum811-bit/serveyMKT.git main --allow-unrelated-histories
"C:\Program Files\Git\bin\git.exe" add .
"C:\Program Files\Git\bin\git.exe" commit -m "fix: role-based supervisor refresh on Render" --allow-empty
"C:\Program Files\Git\bin\git.exe" push https://yunum811-bit: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@github.com/yunum811-bit/serveyMKT.git main
echo === Done ===
pause
