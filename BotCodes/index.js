const { Token, ClientId, ClientSecret } = require('./config');
const { Client, GatewayIntentBits } = require('discord.js');
const Imap = require('imap-simple');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const speakeasy = require('speakeasy');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function getVerificationCode(email, password) {
    const configs = [
        {
            imap: {
                user: email,
                password: password,
                host: 'imap.rambler.ru',
                port: 993,
                tls: true,
                authTimeout: 3000,
            }
        },
        {
            imap: {
                user: email,
                password: password,
                host: 'imap.titan.email',
                port: 993,
                tls: true,
                authTimeout: 3000,
            }
        }
    ];

    for (const config of configs) {
        try {
            const connection = await Imap.connect(config);
            await connection.openBox('INBOX');
            const searchCriteria = ['UNSEEN'];
            const fetchOptions = { bodies: ['TEXT'], struct: true, markSeen: true };
            const messages = await connection.search(searchCriteria, fetchOptions);

            if (messages.length === 0) {
                continue;
            }

            messages.sort((a, b) => new Date(b.attributes.date) - new Date(a.attributes.date));

            const latestMessage = messages[0];
            const body = latestMessage.parts.find(part => part.which === 'TEXT').body;

            console.log('HTML', body);

            const codeMatch = body.match(/\b\d{6}\b/);

            if (codeMatch) {
                console.log('Verification code found:', codeMatch[0]);
                return codeMatch[0];
            }
        } catch (error) {
            console.error('Error accessing the IMAP account:', error);
        }
    }

    return 'Code not found in available emails.';
}

client.on('ready', () => {
    console.log(`Started ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'code') {
        const emailSenha = interaction.options.getString('email-password');
        const [email, senha] = emailSenha.split(':');
        if (!email || !senha) {
            return interaction.reply({ content: 'Please provide the email and password in the format email:password.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const code = await getVerificationCode(email, senha);
        return interaction.editReply({ content: `Verification code: ${code}`, ephemeral: true });
    }

    if (interaction.commandName === '2fa') {
        const token2fa = interaction.options.getString('token');

        await interaction.deferReply({ ephemeral: true });

        try {
            const code2fa = speakeasy.totp({ secret: token2fa, encoding: 'base32' });
            return interaction.editReply({ content: `2FA Code: ${code2fa}`, ephemeral: true });
        } catch (error) {
            console.error(`Erro ao gerar o código 2FA: ${error.message}`);
            return interaction.editReply({ content: 'Error generating the 2FA code. Check the token.', ephemeral: true });
        }
    }
});

client.once('ready', () => {
    console.log('Ready!');
});

const commands = [
    new SlashCommandBuilder()
        .setName('code')
        .setDescription('Get the email verification code')
        .addStringOption(option =>
            option.setName('email-password')
                .setDescription('Enter email and password in the format email:password')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('2fa')
        .setDescription('Get 2FA code')
        .addStringOption(option =>
            option.setName('token')
                .setDescription('2FA token')
                .setRequired(true)
        )
].map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(Token);

(async () => {
    try {
        console.log('registering Slash commands...');

        await rest.put(
            Routes.applicationCommands(ClientId),
            { body: commands },
        );

        console.log('Slash commands registered!');
    } catch (error) {
        console.error(error);
    }
})();

client.login(Token);
