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
      const birthdays = (await calendarService.getEventsForDate(today))
        .filter(event => calendarService.isBirthdayEvent(event));
      
      if (birthdays.length === 0) {
        console.log('No birthdays today!');
        return;
      }

      const message = birthdays
        .map(event => `🎉 Happy Birthday ${calendarService.extractName(event)}! 🎂🎈`)
        .join('\n\n');
      
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
      const birthdays = (await calendarService.getEventsForMonth(today))
        .filter(event => calendarService.isBirthdayEvent(event));
      
      if (birthdays.length === 0) {
        const monthName = today.toLocaleString('default', { month: 'long', year: 'numeric' });
        await whatsappService.sendMessage(`📅 No birthdays scheduled for ${monthName}.`);
        return;
      }

      // Group birthdays by date
      const birthdaysByDate = birthdays.reduce((acc, event) => {
        const startDate = event.start?.date ?? event.start?.dateTime;
        if (!startDate) {
          return acc;
        }
        
        const dateKey = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(calendarService.extractName(event));
        return acc;
      }, {} as BirthdaysByDate);

      // Build message
      const monthName = today.toLocaleString('default', { month: 'long', year: 'numeric' });
      const sortedDates = Object.keys(birthdaysByDate).sort((a, b) => {
        const dateA = new Date(`${a}, ${today.getFullYear()}`);
        const dateB = new Date(`${b}, ${today.getFullYear()}`);
        return dateA.getTime() - dateB.getTime();
      });

      const message = `📅 Upcoming Birthdays in ${monthName}:\n\n${ 
        sortedDates.map(date => `🎂 ${date}: ${birthdaysByDate[date].join(', ')}`).join('\n')}`;

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

