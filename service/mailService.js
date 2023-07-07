const sgMail = require("@sendgrid/mail");

const sendVerificationLink = async (userEmail, userToken) => {
	sgMail.setApiKey(process.env.API_KEY);
	const msg = {
		to: userEmail,
		from: process.env.USER,
		subject: `Welcome ${userEmail} to our community`,
		text: "Please verify your address email first.",
		html: `<strong>Please verify your address email first.</strong> <br><p>Use this <a href="http://localhost:${process.env.APP_PORT}/api/users/verify/${userToken}"> link</a> to verify your account</p>`,
	};
	sgMail
		.send(msg)
		.then(() => {
			console.log("Email sent");
		})
		.catch((error) => {
			console.error(error);
		});
};

module.exports = sendVerificationLink;
