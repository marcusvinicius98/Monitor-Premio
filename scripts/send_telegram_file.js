const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// --- CONFIGURAÇÃO ---
const CONFIG = {
    // Pega as credenciais das "Secrets" do GitHub Actions
    TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    CHAT_ID: process.env.TELEGRAM_CHAT_ID,

    // Caminhos para os arquivos que o monitor-puppeteer.js gera
    DIFF_CNJ_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'Diferencas_CNJ.xlsx'),
    DIFF_TJMT_PATH: path.join(process.cwd(), 'scripts', 'downloads', 'Diferencas_CNJ_TJMT.xlsx')
};

/**
 * Função principal para enviar as notificações.
 */
async function sendNotification() {
    console.log('Iniciando script de notificação do Telegram...');

    // Validação das credenciais
    if (!CONFIG.TOKEN || !CONFIG.CHAT_ID) {
        console.error('❌ Erro: O TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não foram fornecidos.');
        console.error('Verifique se as secrets estão configuradas corretamente no seu repositório GitHub.');
        process.exit(1);
    }

    const bot = new TelegramBot(CONFIG.TOKEN);
    const filesToSend = [];
    let message = '📢 **Monitor do Prêmio CNJ detectou alterações!**\n\n';

    // Verifica quais relatórios de diferença existem para serem enviados
    if (fs.existsSync(CONFIG.DIFF_CNJ_PATH)) {
        filesToSend.push(CONFIG.DIFF_CNJ_PATH);
        message += '▫️ Encontrado relatório geral de diferenças.\n';
    }
    if (fs.existsSync(CONFIG.DIFF_TJMT_PATH)) {
        filesToSend.push(CONFIG.DIFF_TJMT_PATH);
        message += '▫️ Encontrado relatório de diferenças do TJMT.\n';
    }
    
    if (filesToSend.length === 0) {
        console.log('✅ Nenhum arquivo de diferença encontrado. Nenhuma notificação será enviada.');
        return;
    }

    try {
        console.log('Enviando mensagem e relatórios...');

        // Envia a mensagem de texto
        await bot.sendMessage(CONFIG.CHAT_ID, message, { parse_mode: 'Markdown' });

        // Envia cada arquivo como um documento
        for (const filePath of filesToSend) {
            await bot.sendDocument(CONFIG.CHAT_ID, filePath);
            console.log(`📄 Arquivo "${path.basename(filePath)}" enviado com sucesso.`);
        }

        console.log('✅ Notificações enviadas com sucesso!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro fatal ao tentar enviar a notificação:', error.response ? error.response.body : error.message);
        process.exit(1);
    }
}

// Inicia a execução
sendNotification();
