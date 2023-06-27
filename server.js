const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

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
app.use(express.static('public'));

// User side interface - Index page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// User side interface - User form page
app.get('/user', (req, res) => {
    res.sendFile(__dirname + '/user_interface.html');
});

// Management side interface
app.get('/management', (req, res) => {
    db.query('SELECT * FROM queries WHERE resolved = 0', (err, results) => {
        if (err) {
            throw err;
        }
        res.render('management', { queries: results });
    });
});

// Form submission and database processing
app.post('/submit_query', (req, res) => {
    let { name, email, roll, course, year, branch, section, lab, room, query } = req.body;
    const resolved = 0;
    if(query.length > 1){
        query = query[1];
    }
    const queryData = { name, email, roll, course, year, branch, section, lab, room, query, resolved };

    db.query('INSERT INTO queries SET ?', queryData, (err, result) => {
        if (err) {
            throw err;
        }
        console.log('Query submitted successfully');
        res.redirect('/');
    });
});

// Resolve query and send email notification
app.get('/resolve_query', (req, res) => {
    const queryId = req.query.id;

    db.query('UPDATE queries SET resolved = 1 WHERE id = ?', queryId, (err, result) => {
        if (err) {
            throw err;
        }

        db.query('SELECT * FROM queries WHERE id = ?', queryId, (err, result) => {
            if (err) {
                throw err;
            }

            const queryData = result[0];

            // Create a SMTP transporter for sending emails
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.email_id,
                    pass: process.env.pass
                }
            });

            const mailOptions = {
                from: process.env.email_id,
                to: queryData.email,
                subject: 'Query Resolution',
                text: `Dear ${queryData.name},\n\nYour query regarding "${queryData.query}" has been resolved. Thank you for reaching out to us!\n\nBest regards,\nThe Management Team`
            };

            console.log(mailOptions)

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log(error);
                } else {
                    console.log('Email notification sent: ' + info.response);
                }
            });

            res.redirect('/management');
        });
    });
});

// Start the server
app.listen(port,'0.0.0.0',() => {
    console.log(`Server is running on port ${port}`);
});
