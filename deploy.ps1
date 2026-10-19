# Local backup deploy: builds and uploads dist/ to twf.ecologik.net over SSH.
# Pushes to GitHub first. Usage: .\deploy.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$Remote = 'twfecologik@vps.ecologik.net'
$Key = Join-Path $HOME '.ssh\twf_deploy'
$SshOpts = @('-i', $Key, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes')

# A local build ships the working tree, so only deploy committed code.
if (git status --porcelain) {
    Write-Error 'Uncommitted changes. Commit (or stash) them before deploying.'
}

# Keep GitHub in step with what goes live.
git push
if ($LASTEXITCODE -ne 0) { Write-Error 'git push failed; not deploying.' }

npm run build
if ($LASTEXITCODE -ne 0) { Write-Error 'Build failed.' }
if (-not (Test-Path 'dist\.htaccess')) { Write-Error 'dist/.htaccess is missing, add public/.htaccess' }

$Tar = Join-Path $env:TEMP 'twf-dist.tar'
tar -cf $Tar -C dist .
if ($LASTEXITCODE -ne 0) { Write-Error 'Packing dist/ failed.' }

scp @SshOpts $Tar "${Remote}:twf-dist.tar"
if ($LASTEXITCODE -ne 0) { Write-Error 'Upload failed.' }
Remove-Item $Tar

# Replace the old site files, but never touch .well-known (AutoSSL) or cgi-bin.
$RemoteCmd = 'set -e; cd ~/public_html; ' +
    'find . -mindepth 1 -maxdepth 1 ! -name .well-known ! -name cgi-bin -exec rm -rf {} +; ' +
    'tar --no-overwrite-dir -xf ~/twf-dist.tar -C ~/public_html; rm -f ~/twf-dist.tar; echo DEPLOYED'
ssh @SshOpts $Remote $RemoteCmd
if ($LASTEXITCODE -ne 0) { Write-Error 'Remote install failed.' }

Write-Host "Deployed $(git rev-parse --short HEAD) to https://twf.ecologik.net"
