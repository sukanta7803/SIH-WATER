const mongoose = require('mongoose');
require('dotenv').config();

const connection = mongoose.connect('mongodb+srv://setudeyindia_db_user:G8z0myA0G7D9Hiwt@cluster0.pw3lt0s.mongodb.net/water').then(()=>{
    console.log("connected to mongodb");
})

module.exports = connection;