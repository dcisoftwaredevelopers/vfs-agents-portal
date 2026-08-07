const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const PORTAL_NAME = 'Dream Catcher Immigrations B2B Visa Booking Portal';
const replaceVfsBranding = (value = '') =>
  String(value).replace(/\bVFS(?:\s+Global)?\b/gi, PORTAL_NAME);
const formatAppointmentReference = (value = '') =>
  String(value).trim().replace(/^VFS-/i, '');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const formatPercent = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '18';
  return parsed.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};

const getSubscriptionDurationDays = (subscription) => {
  const storedDuration = Number(subscription?.durationDays);
  if (Number.isFinite(storedDuration) && storedDuration > 0) return Math.round(storedDuration);

  const start = subscription?.startDate ? new Date(subscription.startDate) : null;
  const expiry = subscription?.expiryDate ? new Date(subscription.expiryDate) : null;
  if (start && expiry && !Number.isNaN(start.getTime()) && !Number.isNaN(expiry.getTime())) {
    return Math.max(1, Math.round((expiry - start) / MS_PER_DAY));
  }

  return 30;
};

const getSubscriptionGstPercent = (subscription) => {
  const storedPercent = Number(subscription?.gstPercent);
  if (Number.isFinite(storedPercent) && storedPercent >= 0) return storedPercent;

  const planAmount = Number(subscription?.planAmount);
  const gstAmount = Number(subscription?.gstAmount);
  if (Number.isFinite(planAmount) && planAmount > 0 && Number.isFinite(gstAmount)) {
    return (gstAmount / planAmount) * 100;
  }

  return 18;
};

/**
 * Generates an appointment confirmation PDF in-memory and returns it as a Buffer.
 * @param {Object} appointment The appointment mongoose document
 * @param {Object} payment The payment mongoose document
 * @param {Object} slot The slot mongoose document
 * @param {Object} center The center mongoose document
 * @returns {Promise<Buffer>}
 */
exports.generateConfirmationPDF = (appointment, payment, slot, center) => {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Generate QR Code Buffer
      const appointmentReference = formatAppointmentReference(appointment.referenceNumber);
      let qrBuffer;
      if (appointmentReference) {
        try {
          qrBuffer = await QRCode.toBuffer(appointmentReference, { margin: 1, width: 80 });
        } catch (qrErr) {
          console.error('Failed to generate QR Code:', qrErr.message);
        }
      }

      // Initialize PDF A4 Document
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];
      
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // Helper function to draw Footer
      const drawFooter = () => {
        doc.save();
        doc.page.margins.bottom = 0;
        
        // Draw bottom bar
        doc.rect(0, 782, 595, 60).fill('#0c2340');
        
        // Support details
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
        doc.text(PORTAL_NAME.toUpperCase(), 40, 792);
        
        doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1');
        doc.text('Email: info@dreamcatcherimmigrations.com  |  Phone: +91 90470 47512  |  Website: www.dreamcatcherimmigrations.com', 40, 804);
        
        doc.fillColor('#94a3b8').fontSize(7.5);
        doc.text('© 2026 Dream Catcher Immigrations. All rights reserved. Dream Catcher Immigrations is an independent support service provider and is not affiliated with any government agency.', 40, 818, { width: 515 });
        
        doc.restore();
      };

      // Helper function to draw Page Header
      const drawHeader = () => {
        doc.rect(0, 0, 595, 80).fill('#0c2340');
        doc.fillColor('#ffffff')
           .font('Helvetica-Bold')
           .fontSize(14)
           .text(PORTAL_NAME.toUpperCase(), 40, 24, { characterSpacing: 0.5 });
        
        doc.fillColor('#dfa015')
           .font('Helvetica')
           .fontSize(9)
           .text('APPOINTMENT CONFIRMATION LETTER', 40, 50, { characterSpacing: 0.5 });
      };

      // ==========================================
      // PAGE 1: SUMMARY & DETAILS & PAYMENT
      // ==========================================
      drawHeader();

      doc.moveDown(4.5);

      // Welcome / Greeting
      const primaryApplicant = appointment.applicantDetails && appointment.applicantDetails[0];
      const applicantName = replaceVfsBranding(
        primaryApplicant ? `${primaryApplicant.firstName} ${primaryApplicant.lastName}` : 'Applicant'
      );
      
      doc.fillColor('#0c2340')
         .font('Helvetica-Bold')
         .fontSize(13)
         .text(`Dear ${applicantName},`);
      
      doc.moveDown(0.3);
      doc.font('Helvetica')
         .fontSize(9.5)
         .fillColor('#334155')
         .text('Your appointment payment has been verified. Below is the confirmation letter for your biometric appointment. Please present a printed copy of this document at the visa application center.');

      doc.moveDown(1.2);

      // Section: Summary Panel Box
      const panelY = doc.y;
      const panelHeight = 170;
      doc.rect(40, panelY, 515, panelHeight).strokeColor('#e2e8f0').lineWidth(1).stroke();
      doc.rect(40, panelY, 515, 20).fill('#0c2340');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text('APPOINTMENT SUMMARY', 50, panelY + 5);

      // Left Column details (X=50)
      doc.fillColor('#334155').font('Helvetica').fontSize(8.5);
      let currentL = panelY + 28;
      
      doc.font('Helvetica-Bold').text('Application Centre:', 50, currentL);
      const centerNameText = replaceVfsBranding(center ? center.name : 'Visa Application Centre');
      doc.font('Helvetica').text(centerNameText, 150, currentL, { width: 190 });
      
      currentL += Math.max(15, doc.heightOfString(centerNameText, { width: 190 })) + 5;
      doc.font('Helvetica-Bold').text('Centre Address:', 50, currentL);
      const addrText = replaceVfsBranding(center && center.address ? center.address : 'N/A');
      doc.font('Helvetica').text(addrText, 150, currentL, { width: 200 });
      
      // Calculate dynamic address text height to position date/time
      const addressHeight = doc.heightOfString(addrText, { width: 200 });
      currentL += Math.max(15, addressHeight) + 5;

      doc.font('Helvetica-Bold').text('Appointment Schedule:', 50, currentL);
      doc.font('Helvetica-Bold').fillColor('#0c2340').text('To Be Scheduled', 150, currentL);
      doc.fillColor('#334155');

      // Right Column details (X=370)
      let currentR = panelY + 28;
      if (appointmentReference) {
        doc.font('Helvetica-Bold').text('Reference No:', 365, currentR);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#e67e22').text(appointmentReference, 445, currentR, { width: 100 });
        doc.fillColor('#334155');
        currentR += Math.max(15, doc.heightOfString(appointmentReference, { width: 100 })) + 5;
      }
      doc.fontSize(8.5);
      doc.font('Helvetica-Bold').text('Visa Category:', 365, currentR);
      doc.font('Helvetica').text(primaryApplicant ? primaryApplicant.visaCategory : 'N/A', 445, currentR);

      currentR += 15;
      doc.font('Helvetica-Bold').text('Applicants:', 365, currentR);
      const countApplicants = appointment.applicantDetails ? appointment.applicantDetails.length : 1;
      doc.font('Helvetica').text(countApplicants.toString(), 445, currentR);

      // Render QR Code inside the panel
      if (qrBuffer) {
        doc.image(qrBuffer, 465, currentR + 15, { width: 75 });
      }

      // Next section starts after Summary Panel
      const tableY = panelY + panelHeight + 20;
      doc.fillColor('#0c2340').font('Helvetica-Bold').fontSize(10.5).text('APPOINTMENT DETAILS', 40, tableY);

      // Draw Grid / Table Header
      const headerY = tableY + 15;
      doc.rect(40, headerY, 515, 18).fill('#0c2340');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
      doc.text('Applicant Name', 50, headerY + 5);
      doc.text('Passport No.', 200, headerY + 5);
      doc.text('Schedule', 300, headerY + 5);
      doc.text('Visa Category', 370, headerY + 5);
      doc.text('Status', 470, headerY + 5);

      // Draw Grid / Table Rows
      let rowY = headerY + 18;
      if (appointment.applicantDetails && appointment.applicantDetails.length > 0) {
        appointment.applicantDetails.forEach((applicant, index) => {
          // Alternating row styling
          if (index % 2 === 1) {
            doc.rect(40, rowY, 515, 18).fill('#f8fafc');
          } else {
            doc.rect(40, rowY, 515, 18).fill('#ffffff');
          }
          doc.fillColor('#334155').font('Helvetica').fontSize(8);
          doc.text(replaceVfsBranding(`${applicant.firstName} ${applicant.lastName}`), 50, rowY + 5);
          doc.text(replaceVfsBranding(applicant.passportNumber), 200, rowY + 5);
          doc.text('To Be Scheduled', 300, rowY + 5);
          doc.text(replaceVfsBranding(applicant.visaCategory), 370, rowY + 5);
          doc.text('Confirmed', 470, rowY + 5);
          rowY += 18;
        });
      }

      // Section: Payment Details
      const payY = rowY + 15;
      doc.fillColor('#0c2340').font('Helvetica-Bold').fontSize(10.5).text('PAYMENT DETAILS', 40, payY);

      const payBoxY = payY + 15;
      doc.rect(40, payBoxY, 515, 60).strokeColor('#cbd5e1').lineWidth(1).stroke();
      doc.fillColor('#334155').font('Helvetica').fontSize(8.5);

      // Payment Box left column
      doc.font('Helvetica-Bold').text('Transaction Status:', 55, payBoxY + 10);
      doc.font('Helvetica-Bold').fillColor('#10b981').text(payment ? 'SUCCESS' : 'Paid', 160, payBoxY + 10);
      doc.fillColor('#334155');

      doc.font('Helvetica-Bold').text('Amount Paid:', 55, payBoxY + 25);
      doc.font('Helvetica-Bold').text(`INR ${appointment.totalAmount.toFixed(2)}`, 160, payBoxY + 25);

      doc.font('Helvetica-Bold').text('Transaction ID:', 55, payBoxY + 40);
      doc.font('Helvetica-Bold').text(payment ? payment.transactionId : 'N/A', 160, payBoxY + 40);
      doc.fillColor('#334155');

      // Payment Box right column
      doc.font('Helvetica-Bold').text('Payment Method:', 310, payBoxY + 10);
      doc.font('Helvetica').text('Manual UPI Verification', 420, payBoxY + 10);

      doc.font('Helvetica-Bold').text('Payment Date & Time:', 310, payBoxY + 25);
      const payDate = payment ? new Date(payment.updatedAt).toLocaleString('en-GB') : new Date().toLocaleString('en-GB');
      doc.font('Helvetica').text(payDate, 420, payBoxY + 25);

      // Section: Selected Services & Breakdown
      const servicesHeaderY = payBoxY + 75;
      doc.fillColor('#0c2340').font('Helvetica-Bold').fontSize(10.5).text('SELECTED SERVICES & PRICING BREAKDOWN', 40, servicesHeaderY);

      // Draw Selected Services Box
      const servBoxY = servicesHeaderY + 15;
      const servBoxHeight = 100 + Math.max(0, (appointment.servicesSelected ? appointment.servicesSelected.length * 15 : 0));
      doc.rect(40, servBoxY, 515, servBoxHeight).strokeColor('#cbd5e1').lineWidth(1).stroke();

      let itemY = servBoxY + 10;
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8.5);
      doc.text('Service Name', 55, itemY);
      doc.text('Price', 480, itemY, { align: 'right', width: 60 });
      doc.rect(55, itemY + 10, 485, 0.5).fillColor('#cbd5e1').fill();

      itemY += 15;
      doc.font('Helvetica').fontSize(8);
      if (appointment.servicesSelected && appointment.servicesSelected.length > 0) {
        appointment.servicesSelected.forEach(s => {
          doc.text(replaceVfsBranding(s.name), 55, itemY);
          doc.text(`INR ${s.price.toFixed(2)}`, 480, itemY, { align: 'right', width: 60 });
          itemY += 15;
        });
      } else {
        doc.text('No additional services selected', 55, itemY, { oblique: true });
        doc.text('INR 0.00', 480, itemY, { align: 'right', width: 60 });
        itemY += 15;
      }

      // Draw horizontal separator
      doc.rect(55, itemY, 485, 0.5).fillColor('#0c2340').fill();
      itemY += 8;

      // Pricing details breakdown
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155');
      doc.text('Services Subtotal:', 280, itemY);
      doc.text(`INR ${(appointment.selectedServicesTotal || 0).toFixed(2)}`, 480, itemY, { align: 'right', width: 60 });
      itemY += 13;

      doc.text('Appointment Fee:', 280, itemY);
      doc.text(`INR ${(appointment.appointmentFee || 0).toFixed(2)}`, 480, itemY, { align: 'right', width: 60 });
      itemY += 15;

      // Draw final line
      doc.rect(280, itemY - 2, 260, 1).fillColor('#0c2340').fill();
      
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#e67e22');
      doc.text('Grand Total:', 280, itemY + 3);
      doc.text(`INR ${(appointment.totalAmount || 0).toFixed(2)}`, 480, itemY + 3, { align: 'right', width: 60 });

      // Draw footer for page 1
      drawFooter();

      // ==========================================
      // PAGE 2: CONTACT INFO & INSTRUCTIONS
      // ==========================================
      doc.addPage();
      drawHeader();

      doc.moveDown(4.5);

      // Section: Applicant Detailed Information
      doc.fillColor('#0c2340').font('Helvetica-Bold').fontSize(10.5).text('APPLICANT DETAILED INFORMATION', 40, 100);

      let appBoxY = 120;
      if (appointment.applicantDetails && appointment.applicantDetails.length > 0) {
        appointment.applicantDetails.forEach((applicant, idx) => {
          // Outline box
          doc.rect(40, appBoxY, 515, 65).strokeColor('#e2e8f0').lineWidth(1).stroke();
          doc.rect(40, appBoxY, 515, 18).fill('#f1f5f9');
          
          doc.fillColor('#0c2340').font('Helvetica-Bold').fontSize(8.5).text(replaceVfsBranding(`Applicant ${idx + 1}: ${applicant.firstName} ${applicant.lastName}`), 50, appBoxY + 5);
          doc.fillColor('#334155').font('Helvetica').fontSize(8.5);

          // Details row 1
          doc.font('Helvetica-Bold').text('Passport Number:', 50, appBoxY + 25);
          doc.font('Helvetica').text(replaceVfsBranding(applicant.passportNumber), 140, appBoxY + 25);

          doc.font('Helvetica-Bold').text('Nationality:', 50, appBoxY + 38);
          doc.font('Helvetica').text(replaceVfsBranding(applicant.nationality || 'Indian'), 140, appBoxY + 38);

          doc.font('Helvetica-Bold').text('Visa Category:', 50, appBoxY + 51);
          doc.font('Helvetica').text(replaceVfsBranding(applicant.visaCategory), 140, appBoxY + 51);

          // Details row 2
          doc.font('Helvetica-Bold').text('Email Address:', 285, appBoxY + 25);
          doc.font('Helvetica').text(replaceVfsBranding(applicant.email || 'N/A'), 365, appBoxY + 25);

          doc.font('Helvetica-Bold').text('Phone Number:', 285, appBoxY + 38);
          doc.font('Helvetica').text(replaceVfsBranding(applicant.phone || 'N/A'), 365, appBoxY + 38);

          appBoxY += 75;
        });
      }

      // Section: Important Instructions
      const instructY = appBoxY + 10;
      doc.fillColor('#0c2340').font('Helvetica-Bold').fontSize(10.5).text('IMPORTANT INSTRUCTIONS', 40, instructY);

      const instructBoxY = instructY + 15;
      doc.rect(40, instructBoxY, 515, 110).strokeColor('#cbd5e1').lineWidth(1).stroke();
      doc.fillColor('#334155').font('Helvetica').fontSize(8.5);

      let bulletY = instructBoxY + 10;

      doc.font('Helvetica-Bold').fillColor('#dfa015').text('•', 50, bulletY);
      doc.font('Helvetica').fillColor('#334155').text('Please arrive at the application centre exactly 15 minutes before your scheduled appointment time.', 65, bulletY);
      bulletY += 18;

      doc.font('Helvetica-Bold').fillColor('#dfa015').text('•', 50, bulletY);
      doc.font('Helvetica').fillColor('#334155').text('You must carry your original valid passport and a printed copy of this appointment confirmation letter.', 65, bulletY);
      bulletY += 18;

      doc.font('Helvetica-Bold').fillColor('#dfa015').text('•', 50, bulletY);
      doc.font('Helvetica').fillColor('#334155').text('Ensure you bring all required supporting visa documents as specified in your application checklist.', 65, bulletY);
      bulletY += 18;

      doc.font('Helvetica-Bold').fillColor('#dfa015').text('•', 50, bulletY);
      doc.font('Helvetica').fillColor('#334155').text('Mobile phones and other electronic transmission devices must be switched off completely inside the centre.', 65, bulletY);
      bulletY += 18;

      doc.font('Helvetica-Bold').fillColor('#dfa015').text('•', 50, bulletY);
      doc.font('Helvetica').fillColor('#334155').text('Kindly follow the security guidelines and cooperate with the security team on duty at the centre.', 65, bulletY);

      // Draw footer for page 2
      drawFooter();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Generates a professional GST tax invoice PDF in-memory for Agent subscriptions.
 * @param {Object} agent The agent profile mongoose document
 * @param {Object} subscription The subscription mongoose document
 * @param {Object} payment The payment proof mongoose document
 * @returns {Promise<Buffer>}
 */
exports.generateGSTInvoicePDF = (agent, subscription, payment) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];
      
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // Draw Top Header Banner
      doc.rect(0, 0, 595, 80).fill('#0c2340');
      doc.fillColor('#ffffff')
         .font('Helvetica-Bold')
         .fontSize(18)
         .text('DREAM CATCHER IMMIGRATIONS', 40, 24, { characterSpacing: 0.5 });
      
      doc.fillColor('#dfa015')
         .font('Helvetica-Bold')
         .fontSize(10)
         .text('TAX INVOICE / BILL OF SUPPLY', 40, 48, { characterSpacing: 1 });

      // Invoice Details Header (Right Aligned in Banner)
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
      doc.text(`INVOICE NO: ${subscription.invoiceNumber}`, 400, 24, { align: 'right', width: 155 });
      doc.font('Helvetica').fontSize(8);
      const invoiceDate = subscription.paymentDate ? new Date(subscription.paymentDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
      doc.text(`Date: ${invoiceDate}`, 400, 36, { align: 'right', width: 155 });
      doc.text('GSTIN: 07AAAAD3498A1Z0', 400, 48, { align: 'right', width: 155 });

      doc.moveDown(4.5);

      // Section: Supplier vs Buyer info
      const infoY = doc.y;
      
      // Billing From (Supplier)
      doc.fillColor('#0c2340').font('Helvetica-Bold').fontSize(10).text('DETAILS OF SUPPLIER (Billed From)', 40, infoY);
      doc.fillColor('#334155').font('Helvetica').fontSize(8.5);
      doc.text('Dream Catcher Immigrations', 40, infoY + 18);
      doc.text('Shivaji Stadium Metro Station, CP', 40, infoY + 30);
      doc.text('New Delhi - 110001, India', 40, infoY + 42);
      doc.text('Email: billing@dreamcatcherimmigrations.com', 40, infoY + 54);
      doc.text('GSTIN: 07AAAAD3498A1Z0', 400, infoY + 54, { align: 'right', width: 155 }); // Keep GSTIN clean

      // Billing To (Buyer / Recipient)
      doc.fillColor('#0c2340').font('Helvetica-Bold').fontSize(10).text('DETAILS OF RECIPIENT (Billed To)', 40, infoY + 75);
      doc.fillColor('#334155').font('Helvetica').fontSize(8.5);
      doc.text(`Agency Name: ${agent.agencyName}`, 40, infoY + 93);
      doc.text(`Owner Name: ${agent.ownerName}`, 40, infoY + 105);
      doc.text(`Address: ${agent.address}`, 40, infoY + 117);
      doc.text(`${agent.city}, ${agent.state}, ${agent.country}`, 40, infoY + 129);
      doc.text(`Email: ${agent.email} | Mobile: ${agent.mobile}`, 40, infoY + 141);
      doc.font('Helvetica-Bold').text(`GSTIN / UIN: ${agent.gstNumber || 'N/A'}`, 40, infoY + 153);

      // Section: Item Table
      const tableY = infoY + 175;
      doc.fillColor('#0c2340').font('Helvetica-Bold').fontSize(10.5).text('TAXABLE SERVICE BREAKDOWN', 40, tableY);

      // Draw table header
      doc.rect(40, tableY + 15, 515, 20).fill('#0c2340');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
      doc.text('Description of Services', 45, tableY + 21);
      doc.text('SAC Code', 260, tableY + 21);
      doc.text('Taxable Value', 330, tableY + 21, { align: 'right', width: 65 });
      doc.text('GST Rate', 410, tableY + 21, { align: 'right', width: 50 });
      doc.text('Amount (INR)', 470, tableY + 21, { align: 'right', width: 75 });

      // Draw table row
      const rowY = tableY + 35;
      const durationDays = getSubscriptionDurationDays(subscription);
      const gstPercent = getSubscriptionGstPercent(subscription);
      const halfGstPercent = gstPercent / 2;
      doc.rect(40, rowY, 515, 30).fill('#f8fafc');
      doc.fillColor('#334155').font('Helvetica').fontSize(8.5);
      doc.text(`${subscription.planName} - ${durationDays} Days Access\n(Billing Cycle: ${new Date(subscription.startDate).toLocaleDateString('en-GB')} to ${new Date(subscription.expiryDate).toLocaleDateString('en-GB')})`, 45, rowY + 5, { width: 210 });
      doc.text('9985', 260, rowY + 10);
      doc.text(`INR ${subscription.planAmount.toFixed(2)}`, 330, rowY + 10, { align: 'right', width: 65 });
      doc.text(`${formatPercent(gstPercent)}%`, 410, rowY + 10, { align: 'right', width: 50 });
      doc.text(`INR ${subscription.totalAmount.toFixed(2)}`, 470, rowY + 10, { align: 'right', width: 75 });

      // Draw Totals section
      let totalY = rowY + 45;
      doc.rect(280, totalY, 275, subscription.discountApplied ? 95 : 80).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#334155');

      doc.text('Taxable Value (Basic):', 290, totalY + 10);
      doc.text(`INR ${subscription.planAmount.toFixed(2)}`, 450, totalY + 10, { align: 'right', width: 95 });

      let summaryY = totalY + 25;
      if (subscription.discountApplied) {
        doc.fillColor('#10b981');
        doc.text('Referral Discount Applied:', 290, summaryY);
        doc.text(`-INR ${(subscription.discountAmount || 0).toFixed(2)}`, 450, summaryY, { align: 'right', width: 95 });
        summaryY += 15;
        doc.fillColor('#334155');
      }

      doc.text(`CGST @ ${formatPercent(halfGstPercent)}%:`, 290, summaryY);
      doc.text(`INR ${(subscription.gstAmount / 2).toFixed(2)}`, 450, summaryY, { align: 'right', width: 95 });
      summaryY += 15;

      doc.text(`SGST @ ${formatPercent(halfGstPercent)}%:`, 290, summaryY);
      doc.text(`INR ${(subscription.gstAmount / 2).toFixed(2)}`, 450, summaryY, { align: 'right', width: 95 });

      doc.rect(290, summaryY + 15, 255, 0.5).fillColor('#cbd5e1').fill();

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#e67e22');
      doc.text('Total Invoice Amount:', 290, summaryY + 22);
      doc.text(`INR ${subscription.totalAmount.toFixed(2)}`, 450, summaryY + 22, { align: 'right', width: 95 });

      // Amount in words
      doc.fillColor('#334155').font('Helvetica-Oblique').fontSize(8.5);
      doc.text(`Total Invoice Amount (numeric): INR ${subscription.totalAmount.toFixed(2)}`, 40, totalY + 95);

      // Payment proof details
      doc.font('Helvetica').fontSize(8.5);
      doc.text('PAYMENT DETAILS:', 40, totalY + 120);
      doc.rect(40, totalY + 132, 515, 45).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(8);
      doc.text(`Transaction Status: SUCCESS\nTransaction ID: ${payment ? payment.transactionId : 'N/A'}\nPayment Gateway: Manual UPI Proof`, 50, totalY + 140);

      // Signature block
      const sigY = totalY + 210;
      doc.rect(360, sigY, 180, 0.5).fillColor('#0c2340').fill();
      doc.fillColor('#0c2340').font('Helvetica-Bold').fontSize(8).text('Authorized Signatory', 360, sigY + 5, { align: 'center', width: 180 });
      doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text('Dream Catcher Immigrations Billing Dept', 360, sigY + 15, { align: 'center', width: 180 });

      // Invoice Footer
      doc.save();
      doc.page.margins.bottom = 0;
      doc.rect(0, 792, 595, 50).fill('#0c2340');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
      doc.text('DREAM CATCHER IMMIGRATIONS', 40, 804);
      doc.font('Helvetica').fontSize(7.5).fillColor('#cbd5e1');
      doc.text('This is a system generated tax invoice and does not require a physical signature.', 40, 815);
      doc.restore();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
