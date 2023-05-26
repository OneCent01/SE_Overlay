import {gameLoop} from '../helpers/gameLoop.js';
import {
  ADMIN_USERS,
  JOIN_COMMANDS,
  ENABLED_FEATURES,
} from '../helpers/consts.js';
import {
  showCounter, 
  hideCounter, 
  flashCounter, 
  getDeleteCounterByNickname,
  speak,
  updateVoice,
  loadAvailableVoicesDisplay,
} from '../helpers/utils.js';
import {getUsers} from '../helpers/fetch.js';
import {
  initDeleteCounterData, 
  saveUserDeletionCounters, 
  removeUserDeletionCounter
} from '../helpers/deleteCounters.js';
import {runLottery} from '../helpers/lottery.js';
import {updateHypeTrain} from '../helpers/updateHypeTrain.js';

const lotteryCount = document.getElementById('lottery_players_count');

export const handleMessageEvent = async (event, sessionData) => {
  const {userId, msgId, text, tags} = event.data;

  if(!sessionData.users[userId]) {
    const users = await getUsers(sessionData, [userId], []);
    if(users?.length) {
      const [user] = users;
      sessionData.users[userId] = user;
    }
  }

  const counter = sessionData.deleteCounters[userId];
  if(counter) {
    counter.messageIds[msgId] = true;
  }

  const lowerMessage = text.trim().toLowerCase();

  if(
    ENABLED_FEATURES.chat_lottery &&
    sessionData.lottery.isOpen && 
    JOIN_COMMANDS.includes(lowerMessage)
  ) {
    sessionData.lottery.users.add(userId);
    lotteryCount.innerHTML = sessionData.lottery.users.size
  } 

  const isMod = tags?.mod === '1';
  if(ADMIN_USERS.includes(userId) || isMod) {
    handleAdminMessage(text, sessionData);
  }

  if(
    ENABLED_FEATURES.tts &&
    sessionData.tts.isEnabled && 
    tags && 
    tags['custom-reward-id'] && 
    sessionData.tts.eventIds.includes(tags['custom-reward-id'])
  ) {
    speak(sessionData, text);
  } 
}

/*
ADMIN WIDGET COMMANDS
---------------
** HYPE TRAIN **

!chooChoo
- forces a hype train to run 

------------------------
** DELETION COUNTERS **

!showDeleteCounter USERNAME
!hideDeleteCounter USERNAME
!flashDeleteCounter USERNAME

!makeDeleteCounter USERNAME NICKNAME1,NICKNAME2
- adds a counter that tracks the number of messages of theirs that have been deleted

!removeDeleteCounter USERNAME/NICKNAME
- removes a counter that was tracking a given user, if there was one.

-------------------------
** USER SELECT LOTTERY **

!runLottery [WINNERS_COUNT]
- open user lottery and give the numbers of users to select

!play
- user types this command to join the lottery pool
- open to all users in chat while a lotto is open


------------------------
** TTS **

!disabletts
!enabletts
!updateVoice VOICENAME
!skiptts
!showVoices
!hideVoices
!setVoiceVolume VOLUME
*/

const handleAdminMessage = (message, sessionData) => {
  const [firstWord, secondWord] = message.trim().split(' ');

  switch(firstWord) {
    case('!chooChoo'):
      ENABLED_FEATURES.hype_train && updateHypeTrain(sessionData, true);
      break;
    case('!showDeleteCounter'):
      ENABLED_FEATURES.delete_counter && handleShowDeleteCounter(sessionData, message);
      break;
    case('!hideDeleteCounter'):
      ENABLED_FEATURES.delete_counter && handleHideDeleteCounter(sessionData, message);
      break;
    case('!flashDeleteCounter'):
      ENABLED_FEATURES.delete_counter && handleFlashDeleteCounter(sessionData, message);
      break;
    case('!makeDeleteCounter'):
      ENABLED_FEATURES.delete_counter && handleMakeDeleteCounter(sessionData, message);
      break;
    case('!removeDeleteCounter'):
      ENABLED_FEATURES.delete_counter && handleRemoveDeleteCounter(sessionData, message);
      break;
    case('!runLottery'):
      ENABLED_FEATURES.chat_lottery && handleRunLottery(sessionData, message);
      break;
    case('!enabletts'):
      ENABLED_FEATURES.tts && setTtsEnabled(sessionData, true);
      break;
    case('!disabletts'):
      ENABLED_FEATURES.tts && setTtsEnabled(sessionData, false);
      break;
    case('!updateVoice'):
      ENABLED_FEATURES.tts && updateVoice(sessionData, secondWord);
      break;
    case('!skiptts'):
      ENABLED_FEATURES.tts && handleSkipTts();
      break;
    case('!showVoices'):
      ENABLED_FEATURES.tts && handleShowVoices(sessionData);
      break;
    case('!hideVoices'):
      ENABLED_FEATURES.tts && handleHideVoices(sessionData);
      break;
    case('!setVoiceVolume'):
      ENABLED_FEATURES.tts && handleSetVoiceVolume(sessionData, secondWord);
      break;
    default:
      break;
  }
};

const handleSetVoiceVolume = (sessionData, volume) => {
  const newVolume = Number(volume.trim());
  if(
    typeof newVolume === 'number' && 
    !isNaN(newVolume) && 
    newVolume >= 0 && 
    newVolume <= 1
  ) {
    sessionData.tts.volume = newVolume;
  }
}

const voicesElement = document.getElementById('voices');

const handleHideVoices = (sessionData) => {
  voicesElement.classList.add('invisible')
};

const handleShowVoices = async (sessionData) => {
  loadAvailableVoicesDisplay();
  voicesElement.classList.remove('invisible')
};

const handleSkipTts = () => {
  if(speechSynthesis?.speaking) {
    speechSynthesis.cancel();
  }
};

const setTtsEnabled = (sessionData, enabled) => {
  sessionData.tts.isEnabled = enabled;
};

const handleRunLottery = (sessionData, message) => {
  const [firstWord, secondWord] = message.trim().split(' ');
  const secondWordNumber = Number(secondWord);
  const seconds = (
    secondWordNumber && !isNaN(secondWordNumber) ? 
    secondWordNumber : 
    60
  );
  runLottery(sessionData, seconds);
};

const handleDeleteCounterLookup = (sessionData, message) => {
  const messageFragments = message.trim().split(' ');
  if(messageFragments.length !== 2) {
    return;
  }

  const [command, nickname] = messageFragments;
  return getDeleteCounterByNickname(sessionData, nickname);
};

const handleShowDeleteCounter = (sessionData, message) => {
  const counter = handleDeleteCounterLookup(sessionData, message);
  counter?.element && showCounter(sessionData, counter.element);
};

const handleHideDeleteCounter = (sessionData, message) => {
  const counter = handleDeleteCounterLookup(sessionData, message);
  counter?.element && hideCounter(sessionData, counter.element);
};

const handleFlashDeleteCounter = (sessionData, message) => {
  const counter = handleDeleteCounterLookup(sessionData, message);
  counter?.element && flashCounter(sessionData, counter.element);
};

const handleMakeDeleteCounter = async (sessionData, message) => {
  const messageFragments = message.trim().split(' ');
  if(messageFragments.length < 2 || messageFragments.length > 3) {
    return;
  }
  
  const [command, username, nicknames] = messageFragments;
  const users = await getUsers(sessionData, [], [username])
  if(!users?.length) {
    return;
  }

  const [user] = users;
  const formattedNicknames = nicknames?.split(',') || [];
  
  await initDeleteCounterData(sessionData, user.id, formattedNicknames)
  await saveUserDeletionCounters(sessionData);

  return;
};

const handleRemoveDeleteCounter = (sessionData, message) => {
  const messageFragments = message.trim().split(' ');
  if(messageFragments.length !== 2) {
    return;
  }
  removeUserDeletionCounter(sessionData, messageFragments[1]);
  return;
};
