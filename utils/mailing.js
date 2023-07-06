const express = require("express");
const router = express.Router();
const sgMail = require("@sendgrid/mail");

router.post("/", async (req, res, next) => {
	sgMail.setApiKey(process.env.API_KEY);
	const msg = {
		to: "k.twerdpchlib@gmail.com",
		from: "k.twerdpchlib@gmail.com",
		subject: "Sending",
		text: "and easy to do anywhere, even with Node.js",
		html: "<strong>and easy to do anywhere, even with Node.js</strong>",
	};

	sgMail
		.send(msg)
		.then(() => {
			console.log("Email sent");
		})
		.catch((error) => {
			console.error(error);
		});
	res.send("Email sent");
});

module.exports = router;
