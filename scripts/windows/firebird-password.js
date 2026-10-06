import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readFirebirdPassword() {
    const configuredPath = process.env.DB_PASSWORD_FILE?.trim();
    if (!configuredPath) throw new Error('Variável obrigatória ausente: DB_PASSWORD_FILE');

    const baseDirectory = fileURLToPath(new URL('.', import.meta.url));
    const passwordPath = isAbsolute(configuredPath)
        ? configuredPath
        : resolve(baseDirectory, configuredPath);
    const command = [
        "$ErrorActionPreference = 'Stop'",
        "Import-Module (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop",
        '$encrypted = [IO.File]::ReadAllText($env:TERRAZI_DPAPI_SECRET_FILE).Trim()',
        '$secure = ConvertTo-SecureString $encrypted',
        '$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)',
        'try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }',
    ].join('; ');

    try {
        const password = execFileSync(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', command],
            {
                cwd: baseDirectory,
                env: { ...process.env, TERRAZI_DPAPI_SECRET_FILE: passwordPath },
                encoding: 'utf8',
                windowsHide: true,
                timeout: 10000,
                maxBuffer: 65536,
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        if (!password) throw new Error('Senha vazia');
        return password;
    } catch {
        throw new Error(
            'Não foi possível descriptografar DB_PASSWORD_FILE. Execute proteger-senha-firebird.cmd com o mesmo usuário da tarefa agendada.',
        );
    }
}
