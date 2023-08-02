const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config();
const OpenAIApi = require('openai').OpenAIApi
const Configuration = require('openai').Configuration
const app = express();
const port = process.env.port || 3000;

// Create MySQL connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port : process.env.DB_PORT
});

// Connect to the database
db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('Connected to the database');
});

// Set up the view engine
app.set('view engine', 'ejs');

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));


// User side interface - Index page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/home.html');
});

app.get('/home', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});
// User side interface - User form page
app.get('/user', (req, res) => {
    res.sendFile(__dirname + '/user_interface.html');
});

app.get('/auth', (req, res) => {
    res.sendFile(__dirname + '/admin.html');
});



app.get('/cmr-logo', (req, res) => {
    res.sendFile(__dirname + '/labpic.jpeg');
});

// Management side interface
app.get('/management', (req, res) => {
    db.query('SELECT * FROM queries WHERE resolved = "Pending" OR resolved = "Processing"', (err, results) => {
        if (err) {
            throw err;
        }
        res.render('management', { queries: results });
    });
});

// ...
app.post('/adminauth', (req, res) => {
    const { username, password } = req.body;
    
    db.query('SELECT * FROM users WHERE username="admin"', (err, result) => {
        if (err) {
            console.log('Error while fetching query status');
            throw err;
        }
        console.log(result);
        const queryStatus = result[0];
        console.log("ok" , queryStatus);
        if(queryStatus.password === password && queryStatus.username === username){
            res.redirect('/management');
        }
        else{
            res.redirect('/auth');
        }
    });
})
// Form submission and database processing
app.post('/submit_query', async (req, res) => {
    const { name, email, empid, course, year, branch, section, lab, room, block_no, floor_no, query } = req.body;
    const resolved = 'Pending';

    // Generate a unique token number 
    const tokenNumber = Math.floor(1000 + Math.random() * 9000);

    // Escape single quotes in the query field value
    let escapedQuery = db.escape(query);
    const generalOptions  = ["Internet Not Working for all PCs", "Projector Not Working", "Projector Speaker Not Working"];
    if(!generalOptions.includes(escapedQuery)){
        escapedQuery = await generateResponse(escapedQuery, lab);
    }
    const queryData = {
        name,
        email,
        empid,
        // course,
        // year,
        branch,
        // section,
        lab,
        room,
        block_no,
        // floor_no,
        query: escapedQuery,
        resolved,
        token_number: tokenNumber
    };

    db.query('INSERT INTO queries SET ?', queryData, (err, result) => {
        if (err) {
            console.log('Error while inserting data into DB');
            throw err;
        }
        console.log(tokenNumber);
        console.log('Query submitted successfully');
    });
    res.render('successCard', { tokenNumber });

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.email_id,
            pass: process.env.pass
        }
    });

    const mailOptions = {
        from: 'your_email',
        to: queryData.email,
        subject: 'Query Registered and Token Number Generated',
        text: `Dear ${queryData.name},\n\nYour query regarding "${queryData.query}" has been registered with Token Number "${tokenNumber}".\n\nYou will receive an update regarding your query resolution, so stay tuned.\n\nThank you for reaching out to us!\n\nBest regards,\nThe Management Team`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error while sending registered mail');
            console.log(error);
        } else {
            console.log('Email notification sent: ' + info.response);
        }
    });
});

// ...

const configuration = new Configuration({
    apiKey: process.env.API_KEY,
  });
  
  const openai = new OpenAIApi(configuration);
  
  const conversationContext = [];
  const currentMessages = [];
  
const generateResponse = async (prompt, lab) => {
    try {
      const modelId = "gpt-3.5-turbo";
      const promptText = `You are given a description of a problem in ${lab} lab, Provide the short summary of the query in one sentence. Remove unnessary context, and only let me know the exact problem. ${prompt}\n\nResponse:`;
  
      for (const [inputText, responseText] of conversationContext) {
        currentMessages.push({ role: "user", content: inputText });
        currentMessages.push({ role: "assistant", content: responseText });
      }
  
      currentMessages.push({ role: "user", content: promptText });
  
      const result = await openai.createChatCompletion({
        model: modelId,
        messages: currentMessages,
      });
  
      const responseText = result.data.choices.shift().message.content;
      conversationContext.push([promptText, responseText]);
      return "CHATGPT : " + responseText
    } catch (err) {
      console.error(err);
    }
  };


// Fetch query status based on token number
app.post('/status', (req, res) => {
    const { tokenNumber } = req.body;

    db.query('SELECT resolved FROM queries WHERE token_number = ?', tokenNumber, (err, result) => {
        if (err) {
            console.log('Error while fetching query status');
            throw err;
        }
        const queryStatus = result[0] ? result[0].resolved : 'Not Found';
        res.render('userQueryStatus', { queryStatus });
    });
});

// Rendering query status page
app.get('/status', (req, res) => {
    res.render('userQueryStatus');
})

//Updating query status
app.post('/update_query', (req, res) => {
    const { queryId, action } = req.body;
    db.query('UPDATE queries SET resolved = ? WHERE token_number = ?', [action, queryId], (err, result) => {
        if (err) {
            console.log('Error while updating the query status');
            throw err;
        }
        if (action === 'Resolved') {
            db.query('SELECT * FROM queries WHERE token_number = ?', queryId, (err, result) => {
                if (err) {
                    throw err;
                }

                const queryData = result[0];

                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: process.env.email_id,
                        pass: process.env.pass
                    }
                });

                const mailOptions = {
                    from: 'your_email',
                    to: queryData.email,
                    subject: 'Query Resolution',
                    text: `Dear ${queryData.name},\n\nYour query regarding "${queryData.query}" has been resolved. Thank you for reaching out to us!\n\nBest regards,\nThe Management Team`
                };

                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.log(error);
                    } else {
                        console.log('Email notification sent: ' + info.response);
                    }
                });
            });
        }
        res.redirect('/management');
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
