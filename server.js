const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const path = require('path');
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

app.get('/validate', (req, res) => {
    res.sendFile(__dirname + '/validate.html');
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

// Form submission and database processing
app.post('/submit_query', (req, res) => {
    const { name, email, empid, course, year, branch, section, lab, room, block_no, floor_no, query } = req.body;
    const resolved = 'Pending';

    // Generate a unique token number 
    const tokenNumber = Math.floor(1000 + Math.random() * 9000);

    // Escape single quotes in the query field value
    const escapedQuery = db.escape(query);

    const queryData = {
        name,
        email,
        empid,
        course,
        year,
        branch,
        section,
        lab,
        room,
        block_no,
        floor_no,
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

    db.query('UPDATE queries SET resolved = ? WHERE id = ?', [action, queryId], (err, result) => {
        if (err) {
            console.log('Error while updating the query status');
            throw err;
        }
        if (action === 'Resolved') {
            db.query('SELECT * FROM queries WHERE id = ?', queryId, (err, result) => {
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
