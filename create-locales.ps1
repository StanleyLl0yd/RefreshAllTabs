# Create missing locale files without damaging existing translations.
# Run from the extension root directory.
$ErrorActionPreference = 'Stop'
$locales = @('en','ru','de','fr','es','it','pt_BR','pt_PT','nl','pl','da','sv','no','cs','ar','zh_CN','zh_TW','ko','ja')
$root = Join-Path $PSScriptRoot '_locales'
$source = Join-Path $root 'en/messages.json'
if (-not (Test-Path $source)) {
    throw 'Missing English messages.json template.'
}
foreach ($locale in $locales) {
    $dir = Join-Path $root $locale
    $file = Join-Path $dir 'messages.json'
    if (-not (Test-Path $file)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $file
        Write-Host "Created $file (English fallback: translate before shipping)."
    }
}
Write-Host 'Done. Existing locale files were preserved.'
