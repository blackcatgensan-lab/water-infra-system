@echo off
setlocal enabledelayedexpansion

echo ======================================================
echo   水インフラ管理システム - 環境構築スクリプト
echo ======================================================
echo.

rem 1. winget の確認
winget --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [エラー] winget が見つかりません。Windows 10/11 を最新に更新してください。
    pause
    exit /b
)

rem 2. Git のインストール確認と実行
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [情報] Git をインストールしています...
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    echo [重要] Git のインストールを完了させるため、このウィンドウを一度閉じ、
    echo        新しいターミナルでこのスクリプトを再度実行してください。
    pause
    exit /b
) else (
    echo [OK] Git は既にインストールされています。
)

rem 3. GitHub CLI のインストール確認と実行
gh --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [情報] GitHub CLI をインストールしています...
    winget install --id GitHub.cli -e --source winget --accept-package-agreements --accept-source-agreements
    echo [OK] GitHub CLI のインストールが完了しました。
) else (
    echo [OK] GitHub CLI は既にインストールされています。
)

echo.
echo ------------------------------------------------------
echo   Git の初期設定を行います
echo ------------------------------------------------------

set /p GIT_NAME="GitHub で使用するお名前 (例: blackcatgensan-lab): "
set /p GIT_EMAIL="お使いのメールアドレス: "

if not "!GIT_NAME!"=="" (
    git config --global user.name "!GIT_NAME!"
    echo [OK] ユーザー名を登録しました: !GIT_NAME!
)

if not "!GIT_EMAIL!"=="" (
    git config --global user.email "!GIT_EMAIL!"
    echo [OK] メールアドレスを登録しました: !GIT_EMAIL!
)

echo.
echo ------------------------------------------------------
echo   GitHub へのログインを開始します
echo ------------------------------------------------------
echo ブラウザが起動しますので、認証を完了させてください。
echo.
gh auth login --hostname github.com -p https -w

echo.
echo ======================================================
echo   設定が完了しました！
echo ======================================================
echo 今後はこのフォルダで git pull や git push が可能です。
echo.
pause
