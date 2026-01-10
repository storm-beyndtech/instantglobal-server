import { transporter } from "./emailConfig";
import { emailTemplate } from "./emailTemplate";

interface MailData {
	from: string;
	to: string;
	subject: string;
	html: string;
}

const sendMail = (mailData: MailData): Promise<any> => {
	return new Promise((resolve, reject) => {
		transporter.sendMail(mailData, (err: any, info: any) => {
			if (err) {
				console.error("Email send error:", err);
				reject(err);
			} else {
				console.log("Email sent successfully:", info.messageId);
				resolve(info);
			}
		});
	});
};

const sendMailWithRetry = async (mailData: MailData, retries: number = 3): Promise<any> => {
	for (let i = 0; i < retries; i++) {
		try {
			return await sendMail(mailData);
		} catch (error) {
			if (i === retries - 1) throw error;
			console.log(`Retrying sendMail... Attempt ${i + 2} of ${retries}`);
			await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1))); // Wait before retry
		}
	}
};

// Welcome mail (KYC Approved)
export async function welcomeMail(userEmail: string, fullName: string = "Valued Customer"): Promise<void> {
	try {
		const bodyContent = `
      <p>Dear <span class="gold-accent">${fullName}</span>,</p>
      <p>Welcome to the <strong>99Infinite Gold Contract Platform</strong>!</p>
      <p>
        We're thrilled to have you as part of our exclusive contract community. Your KYC verification has been approved
        and you can now access our premium gold-backed contract plans.
      </p>
      <p>
        Start your gold contract journey today and secure your financial future with our 
        professionally managed, gold-backed contract portfolios.
      </p>
      <p>
        If you have questions or need assistance, reach out to our dedicated support team at 
        <a href="mailto:support@99infinite.club" class="gold-accent">support@99infinite.club</a>.
      </p>
      <p>Best regards,</p>
      <p><strong>The 99Infinite Team</strong></p>
    `;

		const mailData: MailData = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "Welcome to 99Infinite - Gold Contract Platform",
			html: emailTemplate(bodyContent),
		};

		await sendMailWithRetry(mailData);
	} catch (error) {
		console.error("Welcome email failed:", error);
		throw error;
	}
}

// Withdrawal requested
export async function withdrawRequested(
	userEmail: string,
	fullName: string,
	amount: number,
	date: Date,
): Promise<void> {
	try {
		const bodyContent = `
      <p>Dear <span class="gold-accent">${fullName}</span>,</p>
      <p>We have received your withdrawal request for <strong class="gold-accent">$${amount.toFixed(
				2,
			)}</strong>.</p>
      <p><strong>Request Details:</strong></p>
      <ul>
        <li>Amount: $${amount.toFixed(2)}</li>
        <li>Date: ${date.toLocaleDateString()}</li>
        <li>Status: Pending Review</li>
      </ul>
      <p>
        Your withdrawal is being processed and will be reviewed by our team. You will receive another 
        email once the withdrawal has been approved and processed.
      </p>
      <p>
        For urgent matters, contact our support team at 
        <a href="mailto:support@99infinite.club" class="gold-accent">support@99infinite.club</a>.
      </p>
      <p>Best regards,</p>
      <p><strong>The 99Infinite Team</strong></p>
    `;

		const mailData: MailData = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "Withdrawal Request Received - 99Infinite",
			html: emailTemplate(bodyContent),
		};

		await sendMailWithRetry(mailData);
	} catch (error) {
		console.error("Withdrawal request email failed:", error);
		throw error;
	}
}

// Withdrawal status update
export async function withdrawStatus(
	userEmail: string,
	fullName: string,
	amount: number,
	date: Date,
	approved: boolean,
): Promise<void> {
	try {
		const status = approved ? "Approved" : "Rejected";
		const statusColor = approved ? "#10b981" : "#ef4444";

		const bodyContent = `
      <p>Dear <span class="gold-accent">${fullName}</span>,</p>
      <p>Your withdrawal request has been <strong style="color: ${statusColor};">${status}</strong>.</p>
      <p><strong>Withdrawal Details:</strong></p>
      <ul>
        <li>Amount: $${amount.toFixed(2)}</li>
        <li>Date: ${date.toLocaleDateString()}</li>
        <li>Status: <span style="color: ${statusColor};">${status}</span></li>
      </ul>
      ${
				approved
					? "<p>Your funds have been processed and should arrive in your account within 24-48 hours.</p>"
					: "<p>Unfortunately, your withdrawal request could not be processed. Please contact support for more information.</p>"
			}
      <p>
        If you have any questions, contact our support team at 
        <a href="mailto:support@99infinite.club" class="gold-accent">support@99infinite.club</a>.
      </p>
      <p>Best regards,</p>
      <p><strong>The 99Infinite Team</strong></p>
    `;

		const mailData: MailData = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: `Withdrawal ${status} - 99Infinite`,
			html: emailTemplate(bodyContent),
		};

		await sendMailWithRetry(mailData);
	} catch (error) {
		console.error("Withdrawal status email failed:", error);
		throw error;
	}
}

// Admin alert
export async function alertAdmin(
	userEmail: string,
	amount: number,
	date: Date,
	type: string,
	additionalInfo?: string,
): Promise<void> {
	try {
		const bodyContent = `
      <p><strong>New ${type} Alert</strong></p>
      <p><strong>User:</strong> ${userEmail}</p>
      <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
      <p><strong>Date:</strong> ${date.toLocaleString()}</p>
      <p><strong>Type:</strong> ${type}</p>
      ${additionalInfo ? `<p><strong>Additional Info:</strong> ${additionalInfo}</p>` : ""}
      <p>Please review and take appropriate action in the admin panel.</p>
    `;

		const mailData: MailData = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || "admin@99infinite.club",
			subject: `Admin Alert: New ${type} - $${amount.toFixed(2)}`,
			html: emailTemplate(bodyContent),
		};

		await sendMailWithRetry(mailData);
	} catch (error) {
		console.error("Admin alert email failed:", error);
		// Don't throw error for admin emails to avoid breaking user flow
	}
}

// Password reset
export async function passwordResetCode(userEmail: string, resetCode: string, fullName: string = "Valued Customer"): Promise<void> {
	try {
		const bodyContent = `
      <p>Dear <span class="gold-accent">${fullName}</span>,</p>
      <p>You requested a password reset for your 99Infinite account.</p>
      <p>Your reset code is: <strong class="gold-accent" style="font-size: 24px; letter-spacing: 2px;">${resetCode}</strong></p>
      <p>This code will expire in 15 minutes for security reasons.</p>
      <p>If you didn't request this reset, please ignore this email.</p>
      <p>Best regards,</p>
      <p><strong>The 99Infinite Team</strong></p>
    `;

		const mailData: MailData = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "Password Reset Code - 99Infinite",
			html: emailTemplate(bodyContent),
		};

		await sendMailWithRetry(mailData);
	} catch (error) {
		console.error("Password reset email failed:", error);
		throw error;
	}
}

// Password reset confirmation
export async function passwordResetConfirmation(userEmail: string, fullName: string = "Valued Customer"): Promise<void> {
	try {
		const bodyContent = `
      <p>Dear <span class="gold-accent">${fullName}</span>,</p>
      <p>Your password has been successfully reset.</p>
      <p>If you didn't make this change, please contact our support team immediately.</p>
      <p>For security, we recommend:</p>
      <ul>
        <li>Using a strong, unique password</li>
        <li>Enabling two-factor authentication</li>
        <li>Never sharing your login credentials</li>
      </ul>
      <p>Best regards,</p>
      <p><strong>The 99Infinite Team</strong></p>
    `;

		const mailData: MailData = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "Password Reset Successful - 99Infinite",
			html: emailTemplate(bodyContent),
		};

		await sendMailWithRetry(mailData);
	} catch (error) {
		console.error("Password reset confirmation email failed:", error);
		throw error;
	}
}

// Deposit requested
export async function depositRequested(
	userEmail: string,
	fullName: string,
	amount: number,
	date: Date,
): Promise<void> {
	try {
		const bodyContent = `
      <p>Dear <span class="gold-accent">${fullName}</span>,</p>
      <p>We have received your deposit request for <strong class="gold-accent">$${amount.toFixed(
				2,
			)}</strong>.</p>
      <p><strong>Request Details:</strong></p>
      <ul>
        <li>Amount: $${amount.toFixed(2)}</li>
        <li>Date: ${date.toLocaleDateString()}</li>
        <li>Status: Pending Review</li>
      </ul>
      <p>
        Your deposit is being processed and will be reviewed by our team. You will receive another 
        email once the deposit has been approved and credited to your account.
      </p>
      <p>
        For urgent matters, contact our support team at 
        <a href="mailto:support@99infinite.club" class="gold-accent">support@99infinite.club</a>.
      </p>
      <p>Best regards,</p>
      <p><strong>The 99Infinite Team</strong></p>
    `;

		const mailData: MailData = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "Deposit Request Received - 99Infinite",
			html: emailTemplate(bodyContent),
		};

		await sendMailWithRetry(mailData);
	} catch (error) {
		console.error("Deposit request email failed:", error);
		throw error;
	}
}

// Deposit status update
export async function depositStatus(
	userEmail: string,
	fullName: string,
	amount: number,
	date: Date,
	approved: boolean,
): Promise<void> {
	try {
		const status = approved ? "Approved" : "Rejected";
		const statusColor = approved ? "#10b981" : "#ef4444";

		const bodyContent = `
      <p>Dear <span class="gold-accent">${fullName}</span>,</p>
      <p>Your deposit request has been <strong style="color: ${statusColor};">${status}</strong>.</p>
      <p><strong>Deposit Details:</strong></p>
      <ul>
        <li>Amount: $${amount.toFixed(2)}</li>
        <li>Date: ${date.toLocaleDateString()}</li>
        <li>Status: <span style="color: ${statusColor};">${status}</span></li>
      </ul>
      ${
				approved
					? "<p>Your funds have been credited to your account and are now available for contract.</p>"
					: "<p>Unfortunately, your deposit request could not be processed. Please contact support for more information.</p>"
			}
      <p>
        If you have any questions, contact our support team at 
        <a href="mailto:support@99infinite.club" class="gold-accent">support@99infinite.club</a>.
      </p>
      <p>Best regards,</p>
      <p><strong>The 99Infinite Team</strong></p>
    `;

		const mailData: MailData = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: `Deposit ${status} - 99Infinite`,
			html: emailTemplate(bodyContent),
		};

		await sendMailWithRetry(mailData);
	} catch (error) {
		console.error("Deposit status email failed:", error);
		throw error;
	}
}

// KYC Request Submitted
export async function kycRequested(userEmail: string, fullName = "Valued Customer") {
	try {
		let bodyContent = `
      <td style="padding: 20px; line-height: 1.8;">
        <p>Dear ${fullName},</p>
        <p>KYC Request Submitted Successfully</p>
        <p>
          Your KYC verification documents have been submitted successfully. 
          We will review your documents and notify you of the status within 24-48 hours.
        </p>
        <p>
          You can check your verification status in your account dashboard.
        </p>
        <p>
          If you have questions or need assistance, reach out 
          to our support team at support@99infinite.club.
        </p>
        <p>Best regards</p>
        <p>The 99infinite Team</p>
      </td>
    `;

		let mailOptions = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "KYC Request Submitted Successfully",
			html: emailTemplate(bodyContent),
		};

		const result = await sendMailWithRetry(mailOptions);
		return result;
	} catch (error) {
		return { error: error instanceof Error && error.message };
	}
}

// KYC Rejected
export async function kycRejected(userEmail: string, fullName = "Valued Customer") {
	try {
		let bodyContent = `
      <td style="padding: 20px; line-height: 1.8;">
        <p>Dear ${fullName},</p>
        <p>KYC has been rejected</p>
        <p>
          Unfortunately, your KYC verification has been rejected. 
          Please review your submitted documents and try again.
        </p>
        <p>
          You can resubmit your documents through your account dashboard.
        </p>
        <p>
          If you have questions or need assistance, reach out 
          to our support team at support@99infinite.club.
        </p>
        <p>Best regards</p>
        <p>The 99infinite Team</p>
      </td>
    `;

		let mailOptions = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "KYC Rejected Successfully",
			html: emailTemplate(bodyContent),
		};

		const result = await sendMailWithRetry(mailOptions);
		return result;
	} catch (error) {
		return { error: error instanceof Error && error.message };
	}
}

// Multi emails (bulk email)
export async function multiMails(emails: string[], subject: string, message: string) {
	try {
		let bodyContent = `
      <td style="padding: 20px; line-height: 1.8;">
        <p>
          ${message}
        </p>
        <p>
          If you have questions or need assistance, reach out 
          to our support team at support@99infinite.club.
        </p>
        <p>Best regards</p>
        <p>The 99infinite Team</p>
      </td>
    `;

		let mailOptions = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: emails,
			subject: subject,
			html: emailTemplate(bodyContent),
		};

		const result = await sendMailWithRetry(mailOptions as any);
		return result;
	} catch (error) {
		return { error: error instanceof Error && error.message };
	}
}

// Referral commission
export async function referralCommission(userEmail: string, fullName: string, amount: number, date: string, referredName = "") {
	try {
		let bodyContent = `
      <td style="padding: 20px; line-height: 1.8;">
        <p>Dear ${fullName},</p>
        <p>Referral Commission</p>
        <p>
          You have earned a referral commission of <strong>$${amount}</strong> on ${date}.
          ${referredName ? `Thank you for referring ${referredName}!` : "Thank you for your referral!"}
        </p>
        <p>
          If you have questions or need assistance, reach out 
          to our support team at support@99infinite.club.
        </p>
        <p>Best regards</p>
        <p>The 99infinite Team</p>
      </td>
    `;

		let mailOptions = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "Referral Commission",
			html: emailTemplate(bodyContent),
		};

		const result = await sendMailWithRetry(mailOptions);
		return result;
	} catch (error) {
		return { error: error instanceof Error && error.message };
	}
}


// Interest added
export async function interestAdded(userEmail:string, fullName:string, amount:number, date:NativeDate) {
	try {
		let bodyContent = `
      <td style="padding: 20px; line-height: 1.8;">
        <p>Dear ${fullName},</p>
        <p>Interest added to your balance</p>
        <p>
          Interest of <strong>$${amount}</strong> has been added to your balance on ${date}.
        </p>
        <p>
          If you have questions or need assistance, reach out 
          to our support team at support@99infinite.club.
        </p>
        <p>Best regards</p>
        <p>The 99Infinite Team</p>
      </td>
    `;

		let mailOptions = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "Interest added to your balance",
			html: emailTemplate(bodyContent),
		};

		const result = await sendMailWithRetry(mailOptions);
		return result;
	} catch (error) {
		return { error: error instanceof Error && error.message };
	}
}

// Contract completed
export async function contractCompleted(userEmail:string, fullName:string, amount:number, date:NativeDate, contractType = "") {
	try {
		let bodyContent = `
      <td style="padding: 20px; line-height: 1.8;">
        <p>Dear ${fullName},</p>
        <p>Contract successfully completed</p>
        <p>
          Your contract ${contractType ? ` in ${contractType}` : ""} of <strong>$${amount}</strong> 
          has been successfully completed on ${date}.
        </p>
        <p>
          If you have questions or need assistance, reach out 
          to our support team at support@99infinite.club.
        </p>
        <p>Best regards</p>
        <p>The 99Infinite Team</p>
      </td>
    `;

		let mailOptions = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "Contract successfully completed",
			html: emailTemplate(bodyContent),
		};

		const result = await sendMailWithRetry(mailOptions);
		return result;
	} catch (error) {
		return { error: error instanceof Error && error.message };
	}
}

// Contract approved
export async function contractApproved(userEmail:string, fullName:string, amount:number, date:NativeDate, contractType = "") {
	try {
		let bodyContent = `
      <td style="padding: 20px; line-height: 1.8;">
        <p>Dear ${fullName},</p>
        <p>Contract Approved</p>
        <p>
          Your contract ${contractType ? ` in ${contractType}` : ''} of <strong>$${amount}</strong> 
          has been approved on ${date}. Your contract is now active and earning returns.
        </p>
        <p>
          You can monitor your contract performance in your account dashboard.
        </p>
        <p>
          If you have questions or need assistance, reach out 
          to our support team at support@99infinite.club.
        </p>
        <p>Best regards</p>
        <p>The 99Infinite Team</p>
      </td>
    `;

		let mailOptions = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "Contract Approved",
			html: emailTemplate(bodyContent),
		};

		const result = await sendMailWithRetry(mailOptions);
		return result;
	} catch (error) {
		return { error: error instanceof Error && error.message };
	}
}

// Contract rejected
export async function contractRejected(userEmail:string, fullName:string, amount:number, date:NativeDate, contractType = "") {
	try {
		let bodyContent = `
      <td style="padding: 20px; line-height: 1.8;">
        <p>Dear ${fullName},</p>
        <p>Contract Request Rejected</p>
        <p>
          Your contract request${contractType ? ` for ${contractType}` : ''} of <strong>$${amount}</strong> 
          submitted on ${date} has been rejected. The funds have been refunded to your account.
        </p>
        <p>
          Please contact our support team for more information.
        </p>
        <p>
          If you have questions or need assistance, reach out 
          to our support team at support@99infinite.club.
        </p>
        <p>Best regards</p>
        <p>The 99Infinite Team</p>
      </td>
    `;

		let mailOptions = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: userEmail,
			subject: "Contract Request Rejected",
			html: emailTemplate(bodyContent),
		};

		const result = await sendMailWithRetry(mailOptions);
		return result;
	} catch (error) {
		return { error: error instanceof Error && error.message };
	}
}
// Admin alert for new user registration
export async function adminNewUserAlert(
	userEmail: string,
	fullName: string,
	username: string,
	registrationDate: Date,
): Promise<void> {
	try {
		const bodyContent = `
      <p><strong>New User Registration Alert</strong></p>
      <p>A new user has registered on the platform.</p>
      <p><strong>User Details:</strong></p>
      <ul>
        <li><strong>Full Name:</strong> ${fullName}</li>
        <li><strong>Username:</strong> ${username}</li>
        <li><strong>Email:</strong> ${userEmail}</li>
        <li><strong>Registration Date:</strong> ${registrationDate.toLocaleString()}</li>
      </ul>
      <p>Please review the new user account in the admin panel.</p>
    `;

		const mailData: MailData = {
			from: process.env.EMAIL_FROM || "noreply@99infinite.club",
			to: process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || "admin@99infinite.club",
			subject: `New User Registration - ${fullName} (${username})`,
			html: emailTemplate(bodyContent),
		};

		await sendMailWithRetry(mailData);
	} catch (error) {
		console.error("Admin new user alert email failed:", error);
		// Don't throw error for admin emails to avoid breaking user registration flow
	}
}

// Contact form submission
export async function sendContactFormEmail(data: {
	name: string;
	email: string;
	company?: string;
	subject: string;
	message?: string;
}): Promise<void> {
	try {
		const bodyContent = `
      <p><strong>New Contact Form Submission</strong></p>
      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 8px 0;"><strong>From:</strong> ${data.name}</p>
        <p style="margin: 8px 0;"><strong>Email:</strong> <a href="mailto:${data.email}" style="color: #a855f7;">${data.email}</a></p>
        ${data.company ? `<p style="margin: 8px 0;"><strong>Company:</strong> ${data.company}</p>` : ""}
        <p style="margin: 8px 0;"><strong>Subject:</strong> ${data.subject}</p>
      </div>
      ${
				data.message
					? `
        <p><strong>Message:</strong></p>
        <div style="background-color: #ffffff; border-left: 4px solid #a855f7; padding: 16px; margin: 16px 0;">
          <p style="white-space: pre-wrap; margin: 0;">${data.message}</p>
        </div>
      `
					: ""
			}
      <p style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
        <strong>Reply to:</strong> <a href="mailto:${data.email}" style="color: #a855f7;">${data.email}</a><br>
        This email was sent from the InstantGlobal contact form.
      </p>
    `;

		const mailData: MailData = {
			from: process.env.EMAIL_FROM || "noreply@instantglobal.com",
			to: process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || "support@instantglobal.com",
			subject: `Contact Form: ${data.subject}`,
			html: emailTemplate(bodyContent),
		};

		await sendMailWithRetry(mailData);

		// Also send confirmation to user
		const confirmationContent = `
      <p>Dear <span style="color: #a855f7; font-weight: bold;">${data.name}</span>,</p>
      <p>Thank you for contacting <strong>InstantGlobal</strong>!</p>
      <p>
        We have received your message regarding "<strong>${data.subject}</strong>" and our team will
        review it shortly. You can expect a response within 24 hours.
      </p>
      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0; font-size: 14px; color: #6b7280;"><strong>Your message:</strong></p>
        ${data.message ? `<p style="margin: 12px 0 0 0; white-space: pre-wrap;">${data.message}</p>` : ""}
      </div>
      <p>
        If you have any urgent concerns, feel free to reach out to us directly at
        <a href="mailto:support@instantglobal.com" style="color: #a855f7;">support@instantglobal.com</a>.
      </p>
      <p>Best regards,</p>
      <p><strong>The InstantGlobal Team</strong></p>
    `;

		const confirmationMailData: MailData = {
			from: process.env.EMAIL_FROM || "noreply@instantglobal.com",
			to: data.email,
			subject: "We received your message - InstantGlobal",
			html: emailTemplate(confirmationContent),
		};

		await sendMailWithRetry(confirmationMailData);
	} catch (error) {
		console.error("Contact form email failed:", error);
		throw error;
	}
}
