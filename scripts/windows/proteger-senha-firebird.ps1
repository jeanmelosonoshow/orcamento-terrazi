$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop

function ConvertTo-PlainText([Security.SecureString]$SecureValue) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

try {
    $first = Read-Host 'Digite a senha do Firebird' -AsSecureString
    $second = Read-Host 'Digite novamente para confirmar' -AsSecureString
    $firstText = ConvertTo-PlainText $first
    $secondText = ConvertTo-PlainText $second
    if ([string]::IsNullOrEmpty($firstText)) { throw 'A senha não pode ficar vazia.' }
    if ($firstText -cne $secondText) { throw 'As senhas informadas são diferentes.' }

    $secretDirectory = Join-Path $PSScriptRoot 'secrets'
    $outputPath = Join-Path $secretDirectory 'firebird-password.dpapi'
    New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
    $encrypted = ConvertFrom-SecureString $first
    [IO.File]::WriteAllText($outputPath, $encrypted, [Text.UTF8Encoding]::new($false))

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $secretDirectory -AclObject $acl

    Write-Host "Senha protegida criada em: $outputPath"
    Write-Host 'A tarefa agendada deve executar com este mesmo usuário do Windows.'
    exit 0
} catch {
    Write-Error $_.Exception.Message
    exit 1
} finally {
    $firstText = $null
    $secondText = $null
}
