import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const caminhoCatalogo = path.join(__dirname, '..', 'config', 'budget-rejection-reasons.json');

function normalizarMotivo(item, indice) {
    const id = String(item?.id || '').trim().toUpperCase();
    const label = String(item?.label || '').trim();
    if (!/^[A-Z0-9_]{2,50}$/.test(id) || !label) return null;
    return {
        id,
        label: label.slice(0, 120),
        description: String(item?.description || '').trim().slice(0, 300),
        active: item?.active !== false,
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : indice + 1
    };
}

export function listarMotivosRecusa({ incluirInativos = false } = {}) {
    const conteudo = JSON.parse(fs.readFileSync(caminhoCatalogo, 'utf8'));
    const ids = new Set();
    return (Array.isArray(conteudo?.reasons) ? conteudo.reasons : [])
        .map(normalizarMotivo)
        .filter(item => {
            if (!item || ids.has(item.id)) return false;
            ids.add(item.id);
            return incluirInativos || item.active;
        })
        .sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label, 'pt-BR'));
}

export function obterMotivoRecusa(id, opcoes) {
    const chave = String(id || '').trim().toUpperCase();
    return listarMotivosRecusa(opcoes).find(item => item.id === chave) || null;
}
