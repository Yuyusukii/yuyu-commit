@echo off
chcp 65001 >nul
title Yuyu Commit
cd /d "%~dp0"

rem ---- Node.js 20 ou mais novo ----
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado.
  echo Instale a versao LTS em https://nodejs.org e depois rode este arquivo de novo.
  pause
  exit /b 1
)
for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAIOR=%%v
if %NODE_MAIOR% LSS 20 (
  echo Seu Node.js e muito antigo. O Yuyu Commit precisa do Node.js 20 ou mais novo.
  echo Instale a versao LTS em https://nodejs.org e depois rode este arquivo de novo.
  pause
  exit /b 1
)

rem ---- Dependencias (rapido quando ja esta tudo instalado; atualiza se o projeto mudou) ----
if not exist node_modules echo Instalando dependencias, so na primeira vez demora...
call npm install --no-audit --no-fund --loglevel=error || goto erro

rem ---- Link https para convidados de fora do Wi-Fi (e microfone no celular) ----
rem Usa o cloudflared, programa oficial e gratuito da Cloudflare. Pergunta uma vez so.
if not exist "ferramentas\cloudflared.exe" if not exist "ferramentas\nao-perguntar" call :oferecer_tunel

echo Preparando o site...
call npm run build --silent || goto erro

call npm start --silent
pause
exit /b 0

:oferecer_tunel
where cloudflared >nul 2>nul
if not errorlevel 1 exit /b 0
echo.
echo Para criar um link https que funciona de qualquer lugar (e libera o microfone
echo no celular), o site usa o cloudflared, programa gratuito da Cloudflare (~55 MB),
echo baixado do GitHub oficial da Cloudflare.
choice /c SN /m "Baixar agora"
if errorlevel 2 (
  if not exist ferramentas mkdir ferramentas
  echo.> "ferramentas\nao-perguntar"
  echo Tudo bem. Para baixar depois, apague o arquivo ferramentas\nao-perguntar.
  exit /b 0
)
if not exist ferramentas mkdir ferramentas
echo Baixando o cloudflared...
powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'ferramentas\cloudflared.exe'"
if not exist "ferramentas\cloudflared.exe" (
  echo Nao consegui baixar. O site vai funcionar so no mesmo Wi-Fi.
)
exit /b 0

:erro
echo.
echo Algo deu errado. Veja a mensagem acima.
pause
exit /b 1
