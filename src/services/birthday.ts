import calendarService from './calendar.js';
import whatsappService from './whatsapp.js';

interface BirthdaysByDate {
  [dateKey: string]: string[];
}

class BirthdayService {
  /**
   * Check for birthdays today and send congratulations
   */
  async checkTodaysBirthdays(): Promise<void> {
    try {
      const today = new Date();
      const events = await calendarService.getEventsForDate(today);
      
      const birthdays = events.filter(event => calendarService.isBirthdayEvent(event));
      
      if (birthdays.length === 0) {
      console.log('No birthdays today!');
        return;
      }

      const messages = birthdays.map(event => {
        const name = calendarService.extractName(event);
        return `🎉 Happy Birthday ${name}! 🎂🎈`;
      });

      const message = messages.join('\n\n');
      await whatsappService.sendMessage(message);
      
      console.log(`Sent birthday wishes for ${birthdays.length} person(s)`);
    } catch (error) {
      console.error('Error checking today\'s birthdays:', error);
      throw error;
    }
  }

  /**
   * Generate and send monthly birthday digest
   */
  async sendMonthlyDigest(): Promise<void> {
    try {
      const today = new Date();
      const events = await calendarService.getEventsForMonth(today);
      
      const birthdays = events.filter(event => calendarService.isBirthdayEvent(event));
      
      if (birthdays.length === 0) {
        const message = `📅 No birthdays scheduled for ${today.toLocaleString('default', { month: 'long', year: 'numeric' })}.`;
        await whatsappService.sendMessage(message);
        return;
      }

      // Group birthdays by date
      const birthdaysByDate: BirthdaysByDate = {};
      birthdays.forEach(event => {
        const startDate = event.start?.date || event.start?.dateTime;
        if (!startDate) return;
        
        const date = new Date(startDate);
        const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        if (!birthdaysByDate[dateKey]) {
          birthdaysByDate[dateKey] = [];
        }
        
        const name = calendarService.extractName(event);
        birthdaysByDate[dateKey].push(name);
      });

      // Build message
      const monthName = today.toLocaleString('default', { month: 'long', year: 'numeric' });
      let message = `📅 Upcoming Birthdays in ${monthName}:\n\n`;
      
      const sortedDates = Object.keys(birthdaysByDate).sort((a, b) => {
        const dateA = new Date(`${a}, ${today.getFullYear()}`);
        const dateB = new Date(`${b}, ${today.getFullYear()}`);
        return dateA.getTime() - dateB.getTime();
      });

      sortedDates.forEach(date => {
        const names = birthdaysByDate[date];
        message += `🎂 ${date}: ${names.join(', ')}\n`;
      });

      await whatsappService.sendMessage(message);
      console.log(`Sent monthly digest with ${birthdays.length} birthday(s)`);
    } catch (error) {
      console.error('Error sending monthly digest:', error);
      throw error;
    }
  }

  /**
   * Check if today is the first day of the month
   * @returns true if today is the first day of the month
   */
  isFirstDayOfMonth(): boolean {
    const today = new Date();
    return today.getDate() === 1;
  }
}

export default new BirthdayService();

