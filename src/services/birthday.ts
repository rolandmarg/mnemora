import calendarService from './calendar.js';
import whatsappService from './whatsapp.js';
import { today, formatDateShort, formatDateMonthYear, isFirstDayOfMonth as checkIsFirstDayOfMonth, parseDateFromString } from '../utils/date.js';

interface BirthdaysByDate {
  [dateKey: string]: string[];
}

class BirthdayService {
  /**
   * Check for birthdays today and send congratulations
   */
  async checkTodaysBirthdays(): Promise<void> {
    try {
      const todayDate = today();
      const birthdays = (await calendarService.getEventsForDate(todayDate))
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
      const todayDate = today();
      const birthdays = (await calendarService.getEventsForMonth(todayDate))
        .filter(event => calendarService.isBirthdayEvent(event));
      
      if (birthdays.length === 0) {
        const monthName = formatDateMonthYear(todayDate);
        await whatsappService.sendMessage(`📅 No birthdays scheduled for ${monthName}.`);
        return;
      }

      // Group birthdays by date
      const birthdaysByDate = birthdays.reduce((acc, event) => {
        const startDate = event.start?.date ?? event.start?.dateTime;
        if (!startDate) {
          return acc;
        }
        
        try {
          const parsedDate = parseDateFromString(startDate);
          const dateKey = formatDateShort(parsedDate);
          if (!acc[dateKey]) {
            acc[dateKey] = [];
          }
          acc[dateKey].push(calendarService.extractName(event));
        } catch {
          // Skip events with invalid dates
          return acc;
        }
        return acc;
      }, {} as BirthdaysByDate);

      // Build message
      const monthName = formatDateMonthYear(todayDate);
      const sortedDates = Object.keys(birthdaysByDate).sort((a, b) => {
        try {
          const dateA = parseDateFromString(`${a}, ${todayDate.getFullYear()}`);
          const dateB = parseDateFromString(`${b}, ${todayDate.getFullYear()}`);
          return dateA.getTime() - dateB.getTime();
        } catch {
          // If date parsing fails, maintain original order
          return 0;
        }
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
    return checkIsFirstDayOfMonth(today());
  }
}

export default new BirthdayService();

