const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const rappelSchema = new Schema({
    clientID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: [true, 'Please provide a client']
    },
    dateRappel: {
        type: Date,
        required: [true, 'Please provide a rappel date']
    },
    message: {
        type: String,
        trim: true,
        maxlength: [500, 'Message can not be more than 500 characters']
    },
    isSent: {
        type: Boolean,
        default: false
    },
    salon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Salon',
        required: [true, 'Please provide a salon']
    }
}, { timestamps: true });