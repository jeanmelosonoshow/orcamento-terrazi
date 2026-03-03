// api/gerar-pdf.js
import PDFDocument from 'pdfkit';

export default async function handler(req, res) {
    const { id, status, view } = req.query;

    if (!id) {
        return res.status(400).json({ error: 'ID do orçamento é obrigatório' });
    }

    try {
        // --- LOGICA DE BUSCA ---
        // Aqui você deve buscar os dados do orçamento no seu banco (ex: Supabase, Neon, etc.)
        // Vou simular um objeto de dados para o exemplo:
        const orcamento = {
            id: id,
            cliente: "Jean G O Melo",
            vendedor: "Pedro",
            total: "1.999,90",
            status: status || "Pendente",
            data: new Date().toLocaleDateString('pt-BR')
        };

        const doc = new PDFDocument({ margin: 50 });

        // Configura o Header para abrir no navegador (inline) ou baixar (attachment)
        const disposition = view === 'true' ? 'inline' : 'attachment';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${disposition}; filename=orcamento_${id}.pdf`);

        doc.pipe(res);

        // --- CONTEÚDO DO PDF (Estilo Casa Terrazi) ---
        doc.fontSize(20).text('CASA TERRAZI', { align: 'center' });
        doc.fontSize(10).text('Gestão de Orçamentos', { align: 'center' });
        doc.moveDown();
        
        doc.rect(50, 100, 500, 2).fill('#1A3017'); // Linha verde oficial
        doc.moveDown(2);

        doc.fontSize(14).fillColor('#333').text(`ORÇAMENTO #${orcamento.id}`);
        doc.fontSize(12).text(`Status: ${orcamento.status.toUpperCase()}`);
        doc.text(`Data: ${orcamento.data}`);
        doc.moveDown();

        doc.fontSize(12).text(`Cliente: ${orcamento.cliente}`);
        doc.text(`Vendedor: ${orcamento.vendedor}`);
        doc.moveDown();

        doc.fontSize(16).fillColor('#1A3017').text(`VALOR TOTAL: R$ ${orcamento.total}`, { align: 'right' });

        doc.end();

    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        res.status(500).json({ error: 'Erro interno ao gerar o PDF' });
    }
}
