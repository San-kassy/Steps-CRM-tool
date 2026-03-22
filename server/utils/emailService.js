const nodemailer = require('nodemailer');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set in environment`);
  }
  return value;
}

const emailHost = requireEnv('EMAIL_HOST');
const emailPortRaw = requireEnv('EMAIL_PORT');
const emailPort = Number(emailPortRaw);

if (Number.isNaN(emailPort)) {
  throw new Error('EMAIL_PORT must be a number');
}

const emailUser = requireEnv('EMAIL_USER');
const emailPassword = requireEnv('EMAIL_PASSWORD');
const frontendUrl = requireEnv('FRONTEND_URL');

// Create transporter with Gmail SMTP configuration
const transporter = nodemailer.createTransport({
  host: emailHost,
  port: emailPort,
  secure: emailPort === 465, // true for 465, false for other ports
  auth: {
    user: emailUser,
    pass: emailPassword,
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Send material request approval email
async function sendApprovalEmail(requestData) {
  if (!requestData.approverEmail) {
    throw new Error('approverEmail is required to send approval email');
  }

  const approvalLink = `${frontendUrl}/material-requests?action=approve&id=${requestData._id}`;
  
  const lineItemsHTML = requestData.lineItems.map(item => `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;">${item.itemName}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${item.quantity} ${item.quantityType}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">$${item.amount || 0}</td>
    </tr>
  `).join('');

  const mailOptions = {
    from: emailUser,
    to: requestData.approverEmail,
    subject: `Material Request Approval Required - ${requestData.requestId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0d6efd;">Material Request Approval Required</h2>
        <p>Dear ${requestData.approver},</p>
        <p>A new material request has been submitted and requires your approval.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Request Details</h3>
          <p><strong>Request ID:</strong> ${requestData.requestId}</p>
          <p><strong>Requested By:</strong> ${requestData.requestedBy}</p>
          <p><strong>Department:</strong> ${requestData.department}</p>
          <p><strong>Date:</strong> ${requestData.date}</p>
          <p><strong>Type:</strong> ${requestData.requestType}</p>
        </div>

        <h3>Line Items</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #0d6efd; color: white;">
              <th style="padding: 10px; text-align: left;">Item</th>
              <th style="padding: 10px; text-align: left;">Quantity</th>
              <th style="padding: 10px; text-align: left;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineItemsHTML}
          </tbody>
        </table>

        ${requestData.message ? `<p><strong>Message:</strong> ${requestData.message}</p>` : ''}

        <div style="margin: 30px 0;">
          <a href="${approvalLink}" style="background-color: #198754; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Review & Approve Request
          </a>
        </div>

        <p style="color: #666; font-size: 12px;">
          This is an automated email. Please do not reply to this message.
        </p>
      </div>
    `,
  };

  try {
    // In development, just log the email
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Email would be sent to:', mailOptions.to);
      console.log('Approval Link:', approvalLink);
      return { success: true, message: 'Email logged (dev mode)' };
    }
    
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}

// Send PO review notification
async function sendPOReviewEmail(poData) {
  if (!poData.requesterEmail) {
    throw new Error('requesterEmail is required to send PO review email');
  }

  const reviewLink = `${frontendUrl}/purchase-orders?action=review&id=${poData._id}`;
  
  const mailOptions = {
    from: emailUser,
    to: poData.requesterEmail,
    subject: `Purchase Order Ready for Review - ${poData.poNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0d6efd;">Purchase Order Ready for Review</h2>
        <p>Dear ${poData.requester},</p>
        <p>A purchase order has been created from your material request and is ready for review.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">PO Details</h3>
          <p><strong>PO Number:</strong> ${poData.poNumber}</p>
          <p><strong>Vendor:</strong> ${poData.vendor}</p>
          <p><strong>Total Amount:</strong> $${poData.totalAmount.toFixed(2)}</p>
          <p><strong>Status:</strong> Pending Review</p>
        </div>

        <div style="margin: 30px 0;">
          <a href="${reviewLink}" style="background-color: #0d6efd; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Review Purchase Order
          </a>
        </div>

        <p style="color: #666; font-size: 12px;">
          This is an automated email. Please do not reply to this message.
        </p>
      </div>
    `,
  };

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 PO Review email would be sent to:', mailOptions.to);
      console.log('Review Link:', reviewLink);
      return { success: true, message: 'Email logged (dev mode)' };
    }
    
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}

// Send password reset email
async function sendPasswordResetEmail(userData, resetToken) {
  if (!userData.email) {
    throw new Error('Email is required to send password reset email');
  }

  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
  
  const mailOptions = {
    from: emailUser,
    to: userData.email,
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0d6efd;">Password Reset Request</h2>
        <p>Dear ${userData.fullName},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        
        <div style="margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #0d6efd; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>

        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>

        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          This is an automated email. Please do not reply to this message.
        </p>
      </div>
    `,
  };

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Password reset email would be sent to:', mailOptions.to);
      console.log('Reset Link:', resetLink);
      return { success: true, message: 'Email logged (dev mode)', resetLink };
    }
    
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
}


// Send OTP code email for MFA verification
async function sendEmailOTP(toEmail, code, userName) {
  if (!toEmail) {
    throw new Error('Email is required to send OTP');
  }

  const mailOptions = {
    from: emailUser,
    to: toEmail,
    subject: 'Your Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #f9fafb; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px 24px; text-align: center;">
          <div style="width: 56px; height: 56px; background: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 28px;">🔐</span>
          </div>
          <h2 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">Verification Code</h2>
        </div>
        <div style="padding: 32px 24px;">
          <p style="color: #374151; margin: 0 0 8px;">Hello${userName ? ` ${userName}` : ''},</p>
          <p style="color: #6b7280; margin: 0 0 28px; line-height: 1.6;">Use the code below to verify your identity. This code expires in <strong>10 minutes</strong>.</p>
          <div style="background: white; border: 2px dashed #3b82f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #1e40af; font-family: 'Courier New', monospace;">${code}</span>
          </div>
          <p style="color: #9ca3af; font-size: 13px; margin: 0; line-height: 1.6;">
            Never share this code with anyone. If you didn't request this, please ignore this email or contact your administrator.
          </p>
        </div>
        <div style="background: #f3f4f6; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">This is an automated email — do not reply.</p>
        </div>
      </div>
    `,
  };

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 OTP email would be sent to:', toEmail);
      console.log('   Code:', code);
      return { success: true, message: 'OTP email logged (dev mode)' };
    }
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'OTP email sent successfully' };
  } catch (error) {
    console.error('Error sending OTP email:', error);
    return { success: false, error: error.message };
  }
}



// Send security alert email
async function sendSecurityAlertEmail(recipientEmails, alertData) {
  if (!recipientEmails || recipientEmails.length === 0) {
    throw new Error('At least one recipient email is required');
  }

  const severityColors = {
    low: '#28a745',
    medium: '#ffc107',
    high: '#dc3545',
    critical: '#721c24'
  };

  const severityColor = severityColors[alertData.severity?.toLowerCase()] || '#0d6efd';

  const mailOptions = {
    from: emailUser,
    to: recipientEmails.join(', '),
    subject: `Security Alert: ${alertData.title}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${severityColor}; color: white; padding: 20px; border-radius: 5px 5px 0 0;">
          <h2 style="margin: 0;">🔒 Security Alert</h2>
        </div>
        
        <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 5px 5px;">
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: ${severityColor};">
              ${alertData.title}
            </h3>
            <p style="margin: 0;"><strong>Severity:</strong> <span style="color: ${severityColor}; text-transform: uppercase;">${alertData.severity}</span></p>
            <p style="margin: 5px 0 0 0;"><strong>Triggered:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <h4>Alert Details</h4>
          <p>${alertData.description}</p>

          ${alertData.details ? `
            <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <h4 style="margin-top: 0;">Additional Information</h4>
              <pre style="background-color: white; padding: 10px; border-radius: 3px; overflow-x: auto;">${JSON.stringify(alertData.details, null, 2)}</pre>
            </div>
          ` : ''}

          ${alertData.actionRequired ? `
            <div style="background-color: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #721c24;">Action Required</h4>
              <p style="margin: 0;">${alertData.actionRequired}</p>
            </div>
          ` : ''}

          <div style="margin: 30px 0;">
            <a href="${frontendUrl}/security-settings" style="background-color: ${severityColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Security Dashboard
            </a>
          </div>

          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated security notification. Please review the alert and take appropriate action.
          </p>
        </div>
      </div>
    `,
  };

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Security alert email would be sent to:', recipientEmails);
      console.log('Alert:', alertData.title, '- Severity:', alertData.severity);
      return { success: true, message: 'Email logged (dev mode)' };
    }
    
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Security alert email sent successfully' };
  } catch (error) {
    console.error('Error sending security alert email:', error);
    return { success: false, error: error.message };
  }
}

// Send notification rule trigger email
async function sendNotificationRuleEmail(rule, logData, recipientEmails) {
  if (!recipientEmails || recipientEmails.length === 0) {
    throw new Error('At least one recipient email is required');
  }

  const mailOptions = {
    from: emailUser,
    to: recipientEmails.join(', '),
    subject: `Security Notification: ${rule.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #0d6efd; color: white; padding: 20px; border-radius: 5px 5px 0 0;">
          <h2 style="margin: 0;">🔔 Security Notification</h2>
        </div>
        
        <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 5px 5px;">
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <h3 style="margin-top: 0;">${rule.name}</h3>
            <p style="margin: 0;"><strong>Rule Triggered:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <h4>Rule Conditions</h4>
          <ul style="line-height: 1.8;">
            ${rule.actions && rule.actions.length > 0 ? `<li><strong>Actions:</strong> ${rule.actions.join(', ')}</li>` : ''}
            ${rule.users && rule.users.length > 0 ? `<li><strong>Users:</strong> ${rule.users.join(', ')}</li>` : ''}
            ${rule.ipAddresses && rule.ipAddresses.length > 0 ? `<li><strong>IP Addresses:</strong> ${rule.ipAddresses.join(', ')}</li>` : ''}
          </ul>

          <h4>Event Details</h4>
          <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p style="margin: 5px 0;"><strong>Action:</strong> ${logData.action}</p>
            <p style="margin: 5px 0;"><strong>User:</strong> ${logData.userName || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>IP Address:</strong> ${logData.ipAddress || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ${logData.status}</p>
            <p style="margin: 5px 0;"><strong>Timestamp:</strong> ${new Date(logData.timestamp).toLocaleString()}</p>
            ${logData.details ? `<p style="margin: 5px 0;"><strong>Details:</strong> ${logData.details}</p>` : ''}
          </div>

          <div style="margin: 30px 0;">
            <a href="${frontendUrl}/security-settings" style="background-color: #0d6efd; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Security Logs
            </a>
          </div>

          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This notification was triggered by a security monitoring rule. Review the event and take action if necessary.
          </p>
        </div>
      </div>
    `,
  };

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Notification rule email would be sent to:', recipientEmails);
      console.log('Rule:', rule.name, '- Action:', logData.action);
      return { success: true, message: 'Email logged (dev mode)' };
    }
    
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Notification email sent successfully' };
  } catch (error) {
    console.error('Error sending notification email:', error);
    return { success: false, error: error.message };
  }
}

// Send signature request email
async function sendSignatureRequestEmail(documentData, recipientEmail, recipientName) {
  if (!recipientEmail) {
    throw new Error('recipientEmail is required to send signature request email');
  }

  const signLink = `${frontendUrl}/docsign/sign/${documentData._id}`;
  
  // Fetch company branding if customBranding is enabled
  let companyName = '';
  let companyLogo = '';
  let primaryColor = '#137fec';
  
  if (documentData.customBranding) {
    try {
      const SystemSettings = require('../models/SystemSettings');
      const settings = await SystemSettings.findOne();
      if (settings) {
        companyName = settings.companyName || 'Acme Corp';
        companyLogo = settings.logoUrl || '';
        primaryColor = settings.primaryColor || '#137fec';
      }
    } catch (error) {
      console.warn('Could not fetch system settings for branding:', error);
    }
  }
  
  const mailOptions = {
    from: emailUser,
    to: recipientEmail,
    subject: documentData.subject || 'You have a document to sign',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${primaryColor}; padding: 20px; border-radius: 8px 8px 0 0;">
          ${documentData.customBranding && companyLogo ? `
            <div style="text-align: center; margin-bottom: 15px;">
              <img src="${companyLogo}" alt="${companyName}" style="max-height: 60px; max-width: 200px;" />
            </div>
          ` : ''}
          <h2 style="color: white; margin: 0;">📝 Document Signature Request</h2>
          ${documentData.customBranding && companyName && !companyLogo ? `
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">${companyName}</p>
          ` : ''}
        </div>
        
        <div style="padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #111418;">Hello ${recipientName || 'there'},</p>
          
          <p style="color: #617589; line-height: 1.6;">
            You have been requested to review and sign a document. Please click the button below to view and sign the document.
          </p>

          ${documentData.message ? `
          <div style="background-color: #f8f9fa; padding: 15px; border-left: 4px solid ${primaryColor}; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #111418;"><strong>Message from sender:</strong></p>
            <p style="margin: 10px 0 0 0; color: #617589;">${documentData.message}</p>
          </div>
          ` : ''}

          <div style="background-color: #f0f2f4; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <p style="margin: 0 0 8px 0; color: #617589; font-size: 14px;"><strong>Document:</strong> ${documentData.name}</p>
            <p style="margin: 0 0 8px 0; color: #617589; font-size: 14px;"><strong>From:</strong> ${documentData.uploadedBy}</p>
            ${documentData.dueDate ? `<p style="margin: 0; color: #617589; font-size: 14px;"><strong>Due Date:</strong> ${new Date(documentData.dueDate).toLocaleDateString()}</p>` : ''}
          </div>

          <div style="text-align: center; margin: 35px 0;">
            <a href="${signLink}" style="background-color: ${primaryColor}; color: white; padding: 14px 40px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px;">
              Review & Sign Document
            </a>
          </div>

          <p style="color: #617589; font-size: 14px; margin-top: 30px;">
            If you have any questions about this document, please contact the sender directly.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            This is an automated email. Please do not reply to this message.<br>
            If you were not expecting this email, you can safely ignore it.
          </p>
        </div>
      </div>
    `,
  };

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Signature request email would be sent to:', recipientEmail);
      console.log('Document:', documentData.name);
      return { success: true, message: 'Email logged (dev mode)' };
    }
    
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Signature request email sent successfully' };
  } catch (error) {
    console.error('Error sending signature request email:', error);
    return { success: false, error: error.message };
  }
}

// Send inventory expiry summary email
async function sendInventoryExpiryAlertEmail(recipientEmails, alertData) {
  if (!recipientEmails || recipientEmails.length === 0) {
    throw new Error('At least one recipient email is required');
  }

  const safeItems = Array.isArray(alertData?.items) ? alertData.items : [];
  const rows = safeItems
    .slice(0, 25)
    .map((item) => {
      const expiry = item.nextExpiry ? new Date(item.nextExpiry).toLocaleDateString() : 'N/A';
      const batches = Array.isArray(item.batches) ? item.batches.length : 0;
      return `
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${item.name || 'Unknown'}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${item.itemId || 'N/A'}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">${item.quantity || 0}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${batches}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${expiry}</td>
        </tr>
      `;
    })
    .join('');

  const subject = `Inventory Expiry Alert: ${safeItems.length} item(s) expiring within ${alertData.days || 30} days`;
  const viewLink = `${frontendUrl}/home`;

  const mailOptions = {
    from: emailUser,
    to: recipientEmails.join(', '),
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 760px; margin: 0 auto;">
        <h2 style="color: #b91c1c;">Inventory Expiry Alert</h2>
        <p>
          ${safeItems.length} inventory item(s) have stock batches expiring within
          <strong>${alertData.days || 30} days</strong>.
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <thead>
            <tr style="background: #fee2e2; color: #7f1d1d;">
              <th style="padding: 10px; border: 1px solid #fecaca; text-align: left;">Item</th>
              <th style="padding: 10px; border: 1px solid #fecaca; text-align: left;">SKU</th>
              <th style="padding: 10px; border: 1px solid #fecaca; text-align: right;">Qty</th>
              <th style="padding: 10px; border: 1px solid #fecaca; text-align: center;">Batches</th>
              <th style="padding: 10px; border: 1px solid #fecaca; text-align: left;">Next Expiry</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="5" style="padding: 12px; border: 1px solid #e5e7eb;">No expiring items.</td></tr>'}
          </tbody>
        </table>

        <p style="margin-top: 12px;">
          <a href="${viewLink}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 6px;">
            Open Dashboard
          </a>
        </p>
        <p style="color: #6b7280; font-size: 12px;">Automated inventory monitoring notification.</p>
      </div>
    `,
  };

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Inventory expiry email would be sent to:', recipientEmails);
      console.log('Expiring items:', safeItems.length);
      return { success: true, message: 'Email logged (dev mode)' };
    }

    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Inventory expiry alert email sent successfully' };
  } catch (error) {
    console.error('Error sending inventory expiry alert email:', error);
    return { success: false, error: error.message };
  }
}

// Send Welcome and Verification Email
async function sendWelcomeVerificationEmail(email, name, verificationToken) {
  if (!email || !verificationToken) {
    throw new Error('Email and verificationToken are required to send verification email');
  }

  const verifyLink = `${frontendUrl}/verify-email?token=${verificationToken}`;

  const mailOptions = {
    from: emailUser,
    to: email,
    subject: 'Welcome to Steps CRM - Please Verify Your Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0d6efd; padding: 24px; text-align: center;">
          <h2 style="color: white; margin: 0; font-size: 24px;">Welcome to Steps CRM! 🚀</h2>
        </div>
        
        <div style="padding: 32px 24px;">
          <p style="font-size: 16px; color: #374151; margin-bottom: 16px;">Hi ${name || 'there'},</p>
          <p style="font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 24px;">
            Thank you for signing up! We're excited to have you on board.
            To complete your registration and secure your account, please verify your email address by clicking the button below.
          </p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verifyLink}" style="background-color: #0d6efd; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">
              Verify Email Address
            </a>
          </div>

          <p style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">
            This verification link will expire in <strong>48 hours</strong>.
          </p>
          <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">
            If you did not sign up for an account, please ignore this email.
          </p>
        </div>
        
        <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 16px 24px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">This is an automated email — do not reply.</p>
        </div>
      </div>
    `,
  };

  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('📧 Verification email would be sent to:', email);
      console.log('   Verification Link:', verifyLink);
      return { success: true, message: 'Verification email logged (dev mode)' };
    }
    
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Verification email sent successfully' };
  } catch (error) {
    console.error('Error sending verification email:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendApprovalEmail,
  sendPOReviewEmail,
  sendPasswordResetEmail,
  sendEmailOTP,
  sendWelcomeVerificationEmail,
  sendSecurityAlertEmail,
  sendNotificationRuleEmail,
  sendSignatureRequestEmail,
  sendInventoryExpiryAlertEmail,
  transporter,
};
