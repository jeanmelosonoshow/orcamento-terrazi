import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const themesPath = path.join(__dirname, '..', 'public', 'filial-themes.json');

export function obterFeaturesFilial(idfilial) {
    try {
        const config = JSON.parse(fs.readFileSync(themesPath, 'utf8'));
        const filial = String(idfilial || '').trim().toUpperCase();
        const themeName = config.branches?.[filial];
        if (!themeName) return {};
        return config.themes?.[themeName]?.features || {};
    } catch {
        return {};
    }
}

export function moduloArquitetosAtivo(idfilial) {
    return obterFeaturesFilial(idfilial).architectsMenuEnabled === true;
}
