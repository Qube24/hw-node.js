const express = require("express");
const router = express.Router();
const fs = require("fs");
const User = require("../../service/schemas/userSchema");
const { registerValidation, loginValidation } = require("../../service/schemas/validation");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const secret = process.env.SECRET_KEY;
const auth = require("../../service/token");
const gravatar = require("gravatar");
const path = require("path");
const multer = require("multer");
const jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const sendMail = require("../../service/mailService");
const verificationToken = uuidv4();

// Register
router.post("/signup", async (req, res) => {
	const { email, password } = req.body;

	// Validation
	const { error } = registerValidation(req.body);
	if (error) {
		return res.status(400).send(error.details[0].message);
	}

	// Does email exist
	const user = await User.findOne({ email });
	if (user) {
		return res.status(409).json({
			status: "error",
			code: 409,
			message: "Email is already in use",
		});
	}
	// Hash password
	const salt = await bcrypt.genSalt(10);
	const hashedPassword = await bcrypt.hash(password, salt);

	// Register message
	try {
		const secureURl = gravatar.url(email, { s: "100", r: "x", d: "retro" }, true);
		const newUser = new User({ email, password: hashedPassword, avatarURL: secureURl, verificationToken: verificationToken, verify: false });
		await newUser.save();
		await sendMail(email, verificationToken);
		res.status(201).json({
			status: "success",
			code: 201,
			user: {
				email: email,
				id: newUser._id,
				verificationToken: verificationToken,
			},
			message: "Registration successful",
		});
	} catch (err) {
		console.error(err);
	}
});

// Login
router.post("/login", async (req, res) => {
	const { email, password } = req.body;
	// Validation
	const { error } = loginValidation(req.body);
	if (error) {
		return res.status(400).send(error.details[0].message);
	}

	// Does user exist
	const userExist = await User.findOne({ email });
	if (!userExist) {
		return res.status(401).json({
			status: "error",
			code: 401,
			message: "Email or password is wrong",
		});
	}

	// Valid verification
	const findUser = await User.findOne({ email });
	const userVerificated = findUser.verify;
	if (!userVerificated) {
		return res.status(401).json({
			status: "error",
			code: 401,
			message: "User is not verified",
		});
	}

	// Valid password
	const validPassword = await bcrypt.compare(password, userExist.password);
	if (!validPassword) {
		return res.status(401).json({
			status: "error",
			code: 401,
			message: "Email or password is wrong",
		});
	}

	// Login logic
	const token = jwt.sign({ _id: userExist._id }, secret, { expiresIn: "1h" });
	res.header("Authorization", token);
	const user = await User.findOneAndUpdate({ _id: userExist._id }, { token: token });
	// Login message
	try {
		res.status(200).json({
			status: "success",
			code: 200,
			user: {
				email: email,
				token: token,
				avatarURL: user.avatarURL,
			},
			message: "Login successful",
		});
	} catch (err) {
		console.error(err);
	}
});

// Logout
router.get("/logout", auth, async (req, res) => {
	const { _id } = req.user;
	const findUser = await User.findById({ _id });

	if (!findUser) {
		return res.status(401).json({
			status: "error",
			code: 401,
			message: "Unauthorized access",
		});
	}

	// Logout message
	try {
		res.header("Authorization", "").status(204).json({
			status: "success",
			code: 204,
		});
	} catch (err) {
		console.log(err);
	}
});

// Current user
router.get("/current", auth, async (req, res) => {
	const { _id } = req.user;
	const currentUser = await User.findById({ _id });
	const token = req.header("Authorization");

	// Current message
	try {
		res.status(200).json({
			status: "success",
			code: 200,
			data: {
				email: currentUser.email,
				token: token,
			},
		});
	} catch (err) {
		res.status(401).json({
			status: "error",
			code: 401,
			message: "Unauthorized access",
		});
	}
});

// Multer middleware

const uploadDir = path.join(process.cwd(), "tmp");
const storeImage = path.join(process.cwd(), "public", "avatars");

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, uploadDir);
	},
	filename: (req, file, cb) => {
		const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 100);
		cb(null, uniqueSuffix + "-" + file.originalname);
	},
	limits: {
		fileSize: 1048576,
	},
});

const upload = multer({
	storage: storage,
});

// Change avatar
router.patch("/avatars", auth, upload.single("avatar"), async (req, res) => {
	const { description } = req.body;
	const { _id } = req.user;
	const { path: temporaryDir, filename } = req.file;
	const name = req.file.filename;
	const oldDir = path.join(uploadDir, filename);
	const newDir = path.join(storeImage, name);

	const scaledImage = async (temporaryDir) => {
		const image = await jimp.read(temporaryDir);
		await image.resize(250, 250);
		await image.write(temporaryDir);
	};

	await scaledImage(temporaryDir);

	// Change avatar message
	try {
		fs.readFile(oldDir, "utf8", (err, data) => {
			fs.writeFile(newDir, data, (err) => {
				fs.unlink(oldDir, () => {
					if (err) throw err;
					console.log("File moved to another directory");
				});
			});
		});

		await User.findOneAndUpdate({ _id: _id }, { avatarURL: newDir });

		res.status(200).json({
			description,
			status: "success",
			code: 200,
			data: {
				avatarURL: newDir,
			},
		});
	} catch (err) {
		res.status(401).json({
			status: "error",
			code: 401,
			message: "Unauthorized access",
		});
	}
});

router.get("/verify/:verificationToken", async (req, res) => {
	const { verificationToken } = req.params;
	try {
		const findUser = await User.findOne({ verificationToken });
		if (!findUser) {
			return res.status(404).json({ message: "User not found" });
		}
		if (findUser.verify) {
			return res.status(400).json({ message: "Verification has already been passed" });
		}

		findUser.verificationToken = "null";
		findUser.verify = true;
		await findUser.save();

		res.status(200).json({
			status: "success",
			code: 200,
			message: "Verification successful",
		});
	} catch (err) {
		res.status(404).json({
			status: "Not Found",
			code: 401,
			message: "User not found",
		});
	}
});

router.post("/verify", async (req, res) => {
	const { email } = req.body;
	const findUser = await User.findOne({ email });
	const userVerificated = findUser.verify;
	try {
		if (!email) {
			res.status(400).json({ message: "missing required field email" });
		} else if (userVerificated) {
			res.status(400).json({ message: "Verification has already been passed" });
		} else if (email && !userVerificated) {
			await sendMail(email, verificationToken);
			res.status(200).json({
				message: "Verification email sent",
			});
		}
	} catch (err) {
		res.status(404).json({
			status: "Error",
			code: 404,
			message: "Error",
		});
	}
});

module.exports = router;
