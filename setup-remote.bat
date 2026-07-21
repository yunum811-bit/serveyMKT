@echo off
echo === Setup Git Remote ===
cd /d "D:\Web\serveyMKT"
"C:\Program Files\Git\bin\git.exe" remote set-url origin https://yunum811-bit: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@github.com/yunum811-bit/serveyMKT.git
echo Remote URL set.
echo === Now pushing ===
"C:\Program Files\Git\bin\git.exe" add .
"C:\Program Files\Git\bin\git.exe" commit -m "fix: role-based supervisor refresh on Render" --allow-empty
"C:\Program Files\Git\bin\git.exe" push origin main
echo === Done ===
pause
