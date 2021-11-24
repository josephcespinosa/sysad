const axios = require('axios');

/**
 * Responds to any HTTP request.
 *
 * @param {!express:Request} req HTTP request context.
 * @param {!express:Response} res HTTP response context.
 */
exports.sendSms = (req, res) => {
	let { to, templateId, subject, message, workspaceId } = req.body;

	let data = {
		to: to,
		messageTemplateId: templateId,
		subject: subject,
		body: message
	}

	axios.post(`${process.env.API_URL}/workspaces/${workspaceId}/messages`, data, {
		headers: {
			"x-api-key": process.env.API_KEY,
			"Accept": "application/vnd.whispir.message-v1+json",
			"Content-Type": "application/vnd.whispir.message-v1+json",
			"Authorization": `Basic ${process.env.AUTH_KEY}`
		}
	}).then(response => {
			return res.json({ data: response.data });
	}).catch(err => {
      return res.status(500).json({ err: err.response.data });
	})
};
