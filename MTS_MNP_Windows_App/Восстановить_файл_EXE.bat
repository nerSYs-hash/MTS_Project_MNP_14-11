@echo off
cd /d "%~dp0"
echo ====================================================
echo    MTS MNP Retention Operator Workspace v2.7.3
echo ====================================================
echo.
if not exist "MTS_MNP.exe" (
    if exist "mts_core_part_00.dat" (
        echo Assembling MTS_MNP.exe... Please wait 2 seconds...
        copy /b mts_core_part_*.dat "MTS_MNP.exe" >nul
        echo Done!
        echo.
    )
)
if exist "MTS_MNP.exe" (
    echo Starting MTS_MNP.exe...
    start "" "MTS_MNP.exe"
    exit
)
echo [ERROR] MTS_MNP.exe not found!
pause
