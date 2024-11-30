import express from "express";
import { google } from "googleapis";
import OpenAI from "openai";
import fs from "fs";
import dotenv from 'dotenv';
dotenv.config();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

//express用
const app = express();
const port = 3005;

//Oauth2Client (ログイン画面)
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,   // Google Cloud Consoleで取得したクライアントID
    process.env.GOOGLE_CLIENT_SECRET, // Google Cloud Consoleで取得したクライアントシークレット
    process.env.REDIRECT_URI          // デスクトップアプリの場合、このリダイレクトURIが使用されます
);

// 認可スコープの指定
const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/youtube.force-ssl'
];

// 認証を開始する関数
// コンソールにURL出力
async function main() {
 try {
    // 認可URLを生成
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this URL:', authUrl);

        const tokenData = JSON.parse(fs.readFileSync('tokens.json', 'utf8'));

        // refresh_token を利用してアクセストークンを更新
        oauth2Client.setCredentials({
            refresh_token: tokenData.refresh_token,
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);


        // 新しいトークンを保存
        fs.writeFileSync('tokens.json', JSON.stringify(credentials, null, 2));
        // YouTube APIの実行
        await logined();

         } catch (error) {
        console.error('Error in main function:', error);
    }

}
//Oauth2.0の受け取りページの作成
app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;

    try {
        //Access_tokenからユーザー情報を取得
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        await fs.writeFileSync('tokens.json', JSON.stringify(tokens, null, 2));
        await logined();

        // トークンを表示
        res.send(`
      <h1>Access Token:</h1>
      <pre>${JSON.stringify(tokens, null, 2)}</pre>
      <script>window.close()</script>
    `);
    } catch (err) {
        console.error('Error retrieving access token:', err);
        res.status(500).send('Authentication failed');
    }
});
//expressの起動
app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
});

//youtubeの動画Id
const VIDEO_ID = process.env.YOUTUBE_VIDEO_ID;
async function logined() {

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    //CommentThreadsを取得
    const response = await youtube.commentThreads.list({
        'part': 'replies, snippet',
        'videoId': VIDEO_ID,
        'order': 'time',
        'textFormat': 'plaintext',
        'maxResults': 10,
    });

    //logに表示
    for (const item of response.data.items) {
        const topLevelComment = item.snippet.topLevelComment.snippet;

    // すでにコメントしていたら終了   
        const response = await youtube.comments.list({
            part: 'snippet',
            parentId: item.id,// 親コメントのID
            maxResults: 10, // 最大取得数
        });

     const isCommented  = response.data.items.find((reply) => {
            const replySnippet = reply.snippet;
         console.log(replySnippet.authorDisplayName==="@お前を守る系ギャル",replySnippet.textDisplay);
            return replySnippet.authorDisplayName==="@お前を守る系ギャル"
        });
       
        // コメントされていないなら、スレッドに返信コメントする
        // isCommentedがundefinedの場合、コメントを返信する
        if(!isCommented){
            await fetchReplies(item.id,topLevelComment.textDisplay);
        }

    }
}
// スレッドに返信コメントする
async function fetchReplies(parentId,topLevelComment) {
    try {
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });


        // 攻撃的であればギャル風コメントを生成
            const generatedReply = await analyzeCommentAndGenerateReply(topLevelComment);
            console.log(`  - コメント : ${topLevelComment}`);
            console.log(`  - 生成された値: ${generatedReply}`);
            if(generatedReply!= false){
                // コメントに返信
                await youtube.comments.insert({
                    part: 'snippet',
                    requestBody: {
                        snippet: {
                            textOriginal: generatedReply,
                            parentId: parentId,
                        },
                    },
                });
            }
    } catch (error) {
        console.error('返信コメントの取得に失敗しました:', error);
    }
}
//メインの実行
main();



// コメントに対して、ギャル風の文章を生成
async function analyzeCommentAndGenerateReply(topLevelComment) {
    // コメントが攻撃的かどうかを判定する
    const moderationResponse = await openai.moderations.create({
         model:"omni-moderation-latest",
        input: topLevelComment,
    });

    // モデレーションAPIの結果から攻撃性を判定
    const isOffensive = moderationResponse.results[0]?.flagged || false;

    if (!isOffensive) {
        return isOffensive; // 攻撃的ではない場合 falseを返す
    }

    // 攻撃的なコメントに対して返信を生成
    const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content:
                    "あなたはギャル風のキャラクターです。誰かが誹謗中傷を受けたとき、その人を元気づけたり、相手を注意したりする文章を優しく、時に強く作成してください。絵文字を適度に使用し、フレンドリーなトーンで書いてください。",
            },
            {
                role: "user",
                content: `以下のコメントを見て、被害者を守る感じでギャル風の文章を作成してください。\n\nコメント: ${topLevelComment}`,
            },
        ],
        stream: true,
    });

    let replyText = ""; // 生成された文章を保持する

    for await (const chunk of stream) {
        const deltaContent = chunk.choices[0]?.delta?.content || "";
        replyText += deltaContent; // 文章を収集
    }

    return replyText; // 最終的な文章を返す
}

