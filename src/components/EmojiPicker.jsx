import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MagnifyingGlassIcon, XMarkIcon, ArrowPathIcon, HeartIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline'
import { useAppStore } from '../store/useAppStore'
import { useTranslation } from '../hooks/useTranslation'
import emojiNameMap from 'emoji-name-map'
import '../assets/styles/EmojiPicker.css'

const PAGE_SIZE = 24
const FAV_KEY = 'voltchat_fav_gifs'

const MIN_WIDTH = 280
const MAX_WIDTH = 500
const MIN_HEIGHT = 300
const MAX_HEIGHT = 500

const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾','🙈','🙉','🙊','💋','💌','💘','💝','💟','❣️','💔','🧡','💛','💚','💙','💜','🤎','🤍','🖤','💯','💢','💥','💫','💦','💨','🕳️','💣','💬','👁️‍🗨️','🗨️','🗯️','💭','💤','🔥','✨','⭐','🌟','💫','💥','💢','💦','💨','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛','🕜','🕝','🕞','🕟','🕠','🕡','🕢','🕣','🕤','🕥','🕦','🕧','⌛','⏳','⌚','⏰','⏱️','⏲️','🕰️','🗓️','🗑️','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↩️','↪️','⤴️','⤵️','🔃','🔄','🔙','🔚','🔛','🔜','🔝','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚮','🚰','♿','🚹','🚺','🚼','⚧️','🚻','🚮','🏷️','📛','🔰','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤'],
  'Gestures': ['👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂','🥷','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰','🤱','👼','🎅','🤶','🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','💆','💇','🚶','🏃','💃','🕺','🕴️','👯','🧖','🧗','🤸','🏌️','🏇','⛷️','🏂','🏋️','🤸','🤺','🤾','🏇','🧘','🛀','🛌','👭','👫','👬','💏','💑','👪','👨‍👩‍👦','👨‍👩‍👧','👨‍👩‍👧‍👦','👨‍👩‍👦‍👦','👨‍👩‍👧‍👧','👨‍👩‍👧‍👦','👨‍👩‍👧‍👧','👨‍👩‍👦‍👦','👨‍👩‍👦‍👧','👨‍👩‍👧‍👦','👨‍👩‍👧‍👧','👨‍👦','👨‍👦‍👦','👨‍👧','👨‍👧‍👦','👨‍👧‍👧','👩‍👦','👩‍👦‍👦','👩‍👧','👩‍👧‍👦','👩‍👧‍👧','👨‍👨‍👦','👨‍👨‍👧','👨‍👨‍👦‍👦','👨‍👨‍👧‍👦','👨‍👨‍👧‍👧','👩‍👩‍👦','👩‍👩‍👧','👩‍👩‍👦‍👦','👩‍👩‍👧‍👦','👩‍👩‍👧‍👧','🧑‍🤝‍🧑','🧑‍❤️‍💋‍🧑','👨‍❤️‍💋‍👨','👩‍❤️‍💋‍👩','👨‍👩‍❤️','👨‍👩‍💋','👨‍👩‍👨‍👩‍❤️','👨‍👩‍👧','👨‍👩‍👧‍👧','🧗','🤸','🏌️','🏇','⛷️','🏂','🏋️','🤸','🤺','🤾','🏇','🧘','🛀','🛌','👭','👫','👬','💏','💑','👪','🚴','🚵','🧗‍♀️','🧗‍♂️','🏇','⛹️','🏋️','🤸','⛳','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧘','🛀','🛌','🤸','🤺','🤾','🏇','🧖','🚴','🚵','🏄','🏊','🤽','🚣'],
  'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','😻','💌','💒','🏩','🫀','🫁','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','💋','👩‍❤️‍👨','👨‍❤️‍👨','👩‍❤️‍👩','💑','👫','👩‍❤️‍💋‍👨','👨‍❤️‍💋‍👨','👩‍❤️‍💋‍👩','🧑‍🤝‍🧑','🧑‍❤️‍🧑','👩‍❤️‍👨','👨‍❤️‍👨','👩‍❤️‍👩','👨‍👩‍❤️','👩‍❤️‍👨','👨‍❤️‍👩','💏','👪','👨‍👩‍👦','👨‍👩‍👧','👨‍👩‍👧‍👦','👨‍👩‍👧‍👧','🧑‍🤝‍🧑'],
  'Objects': ['⚡','🔥','✨','🎉','🎊','🎁','🏆','🥇','🎯','🎮','🎲','🎸','🎺','🎻','🎹','🥁','💻','📱','⌨️','🖥️','💾','📷','📸','🎬','📺','📻','⏰','💡','🔋','🔌','💰','🪙','💴','💵','💶','💷','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕹️','🧩','♟️','🃏','🎴','🎭','🖼️','🧵','🪡','🧶','🪢','🎪','🤹','🎨','🧵','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','🎯','🎳','🎮','🎰','🧩','♠️','♣️','♥️','♦️','🃏','🎴','🎫','🏧','🚮','🚰','♿','🚹','🚺','🚼','⚧️','🚻','🚮','🏷️','📛','🔰','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏢','🏠','🏗️','🧱','🪨','🪵','🛖','🛤️','🛣️','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🛖','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🕍','🛕','🕋','⛩️','🛤️','🛣️','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🛖','🏠','🏡','🗝️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🧄','🧅','🥚','🍳','🧈','🥞','🧇','🥖','🥨','🥯','🥯','🧀','🥗','🥙','🥪','🌯','🌮','🍕','🍟','🍔','🌭','🥪','🥙','🧆','🍜','🍝','🍣','🍱','🍙','🍚','🍛','🍜','🍲','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🍵','🧃','🥤','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊','🧂','🥣','🥤','🍽️','🍴','🥄','🔪','🏺','🎃','🎄','🎆','🎇','🧨','🎈','🎉','🎊','🎎','🎏','🎐','🧧','🎑','🕎','🧘','🛀','🛁','🚿','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🧧','💰','💳','💵','💴','💶','💷','🪙','💸','💳','🧾','🧾','📦','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','📈','📉','📊','📋','📌','📍','📎','🖇️','📏','📐','✂️','🗃️','🗳️','🗄️','📚','📖','📗','📘','📙','📓','📔','📒','📕','📗','📘','📙','📚','📙','🧷','🧸','🧹','🧺','🧻','🚽','🚰','🚿','🛁','🧼','🪥','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🧧','🎓','🎒','👑','🎩','🎓','🧢','🧤','🧥','🧦','👔','👕','👖','🧣','🧤','🧥','🧦','👗','👘','🥻','🩱','🩲','🩳','👙','👚','👛','👜','👝','🎒','👞','👟','🥾','🥿','👠','👡','👢','🩰','👑','👒','🎩','🎓','🧢','💄','💍','💎','💼','🥊','🥋','🎽','🎿','🥌','🎯','🎱','🎳','🎮','🎰'],
  'Nature': ['🌸','🌺','🌻','🌼','🌷','🌹','🥀','🌲','🌳','🌴','🌵','🍀','☘️','🍃','🍂','🍁','🌾','🌱','🌿','☀️','🌙','⭐','🌟','✨','⚡','🔥','🌈','☁️','❄️','💧','🌊','💦','🚿','🛁','🧊','🌪️','🌤','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','💧','💦','☔','☂️','🌊','🌋','⛰️','🏔️','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🪨','🪵','🛖','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🕍','🛕','🕋','⛩️','🛤️','🛣️','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🛖','🏠','🏡','🌅','🌄','🌠','🎇','🎆','🌇','🌆','🏙️','🌃','🌌','🌉','🌁','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🧊','❄️','⛄','☃️','🌨️','🌧️','🌦️','🌥️','⛅','🌤️','☀️','🌙','🌛','🌜','🌚','🌝','🌞','🌟','⭐','🌠','🌌','🌍','🌎','🌏','🌐','🗺️','🗿','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🧭','🏹','🎯','🪃','🪁','🪂','🛡️','🛡️','⚔️','💣','🧨','🪓','🔪','🗡️','⚔️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕹️','🧩','♟️','🃏','🎴','🎭','🖼️','🎪','🤹','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎲','🎯','🎳','🎮','🎰','🍀','☘️','🍁','🍂','🍃','🌿','🌱','🌲','🌳','🌴','🌵','🌾','🌿','☘️','🍀','🍃','🍂','🍄','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🥠','🥮','🍤','🍙','🍚','🍘','🍥','🥣','🥤','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾','🧃','🥤','🧋','🧊','🥛','🍼','☕','🍵','🧉','🍶'],
  'Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🕸️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔','🐾','🐉','🐲','🌵','🎄','🌲','🌳','🌴','🪵','🐚','🪸','🐌','🐛','🦋','🐝','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🕸️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐳','🐋','🐬','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'],
  'Flags': ['🏳️','🏴','🏴‍☠️','🏴‍🏳️','🏁','🚩','🎌','🏳️‍🌈','🏳️‍⚧️','🇺🇸','🇬🇧','🇨🇦','🇦🇺','🇩🇪','🇫🇷','🇪🇸','🇮🇹','🇯🇵','🇰🇷','🇧🇷','🇲🇽','🇮🇳','🇨🇳','🇷🇺','🇿🇦','🇳🇬','🇪🇬','🇸🇪','🇳🇱','🇧🇪','🇨🇭','🇦🇹','🇵🇱','🇳🇴','🇩🇰','🇫🇮','🇮🇪','🇳🇿','🇸🇬','🇲🇾','🇮🇩','🇹🇷','🇸🇦','🇮🇱','🇵🇹','🇬🇷','🇨🇿','🇭🇺','🇷🇴','🇧🇬','🇺🇦','🇨🇿','🇭🇷','🇸🇮','🇱🇹','🇱🇻','🇪🇪','🇱🇾','🇲🇦','🇩🇿','🇹🇳','🇰🇪','🇰🇬','🇺🇿','🇹🇯','🇹🇿','🇲🇲','🇵🇭','🇻🇳','🇹🇭','🇱🇦','🇲🇩','🇬🇪','🇦🇲','🇦🇿','🇰🇿','🇧🇾','🇰🇼','🇶🇦','🇧🇭','🇴🇲','🇾🇹','🇮🇶','🇯🇴','🇱🇧','🇸🇾','🇾🇪','🇸🇹','🇵🇸','🇦🇱','🇲🇪','🇽🇰','🇲🇰','🇦🇫','🇦🇮','🇧🇧','🇯🇲','🇹🇹','🇩🇲','🇦🇬','🇰🇳','🇱🇨','🇲🇸','🇦🇮','🇧🇲','🇻🇬','🇹🇨','🇹🇻','🇨🇼','🇸🇷','🇭🇹','🇵🇷','🇻🇮','🇦🇼','🇧🇶','🇨🇩','🇨🇲','🇨🇫','🇬🇶','🇬🇼','🇳🇪','🇸🇳','🇸🇱','🇸🇸','🇸🇴','🇸🇩','🇸🇧','🇵🇾','🇺🇾','🇧🇴','🇧🇼','🇱🇸','🇸🇿','🇿🇦','🇳🇦','🇲🇿','🇲🇬','🇲🇼','🇿🇲','🇨🇦','🇺🇸','🇲🇽','🇧🇷','🇦🇷','🇨🇴','🇨🇱','🇵🇪','🇻🇪','🇵🇦','🇨🇷','🇬🇹','🇧🇿','🇭🇳','🇸🇻','🇳🇮','🇨🇺','🇩🇴','🇯🇲','🇭🇹','🇹🇹','🇧🇲','🇧🇦','🇦🇬','🇦🇮','🇧🇧','🇨🇼','🇭🇳','🇲🇶','🇲� Martinique','🇬🇵','🇬🇪','🇸🇨','🇲🇺','🇲🇻','🇫🇯','🇵🇫','🇼🇸','🇬🇺','🇲🇵','🇬🇫','🇵🇲','🇲🇫','🇳🇷','🇵🇳','🇼🇫','🇲🇭','🇵🇼','🇬🇾','🇲🇱','🇲🇾','🇸🇦','🇦🇪','🇶🇦','🇰🇼','🇴🇲','🇧🇭','🇹🇳','🇮🇶','🇮🇷','🇸🇮','🇭🇷','🇸🇲','🇨🇮','🇨🇬','🇨🇩','🇨🇲','🇨🇫','🇬🇶','🇬🇼','🇳🇪','🇸🇳','🇸🇱','🇸🇸','🇸🇴','🇸🇩','🇸🇧','🇵🇾','🇺🇾','🇧🇴','🇧🇼','🇱🇸','🇸🇿','🇿🇦','🇳🇦','🇲🇿','🇲🇬','🇲🇼','🇿🇲','🇨🇦','🇺🇸','🇲🇽','🇧🇷','🇦🇷','🇨🇴','🇨🇱','🇵🇪','🇻🇪','🇵🇦','🇨🇷','🇬🇹','🇧🇿','🇭🇳','🇸🇻','🇳🇮','🇨🇺','🇩🇴','🇯🇲','🇭🇹','🇹🇹','🇧🇲','🇧🇦','🇦🇬','🇦🇮','🇧🇧','🇨🇼','🇭🇳','🇲🇶','🇬🇵','🇬🇪','🇸🇨','🇲🇺','🇲🇻','🇫🇯','🇵🇫','🇼🇸','🇬🇺','🇲🇵','🇬🇫','🇵🇲','🇲🇫','🇳🇷','🇵🇳','🇼🇫','🇲🇭','🇵🇼','🇬🇾','🇲🇱','🇲🇾','🇦🇩','🇦🇮','🇦🇶','🇦🇬','🇦🇹','🇦🇼','🇦🇲','🇦🇪','🇦🇫','🇦🇫','🇦🇪','🇦🇬','🇦🇮','🇦🇲','🇦🇼','🇦🇹','🇦🇶'],
}

const ALL_EMOJIS = Object.entries(emojiNameMap.emoji).map(([name, emoji]) => ({ name, emoji }))

const CATEGORY_ORDER = ['Smileys', 'Gestures', 'Hearts', 'Objects', 'Nature', 'Animals', 'Flags']

const categorizeEmoji = (emoji) => {
  const char = emoji.emoji
  const code = char.codePointAt(0)
  if (0x1F600 <= code && code <= 0x1F64F) return 'Smileys'
  if (0x1F300 <= code && code <= 0x1F5FF) return 'Objects'
  if (0x1F680 <= code && code <= 0x1F6FF) return 'Objects'
  if (0x2600 <= code && code <= 0x26FF) return 'Nature'
  if (0x2700 <= code && code <= 0x27BF) return 'Objects'
  if (code >= 0x1F1E0 && code <= 0x1F1FF) return 'Objects'
  if (code >= 0x1F900 && code <= 0x1F9FF) return 'Smileys'
  return 'Smileys'
}

const categorizedEmojis = CATEGORY_ORDER.reduce((acc, cat) => {
  acc[cat] = ALL_EMOJIS.filter(e => categorizeEmoji(e) === cat)
  return acc
}, {})

function loadFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || [] } catch { return [] }
}
function saveFavs(favs) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)) } catch {}
}

const EmojiPicker = ({ onSelect, onClose, serverEmojis = [], showGifs = true, initialWidth, initialHeight }) => {
  const { t } = useTranslation()
  const globalEmojis = useAppStore(state => state.globalEmojis)
  const allEmojis = serverEmojis?.length > 0 
    ? [...serverEmojis, ...globalEmojis.filter(g => !serverEmojis.some(s => s.name === g.name))]
    : globalEmojis
     
  const [activeTab, setActiveTab] = useState(allEmojis?.length > 0 ? 'server' : 'emoji')
  const [searchQuery, setSearchQuery] = useState('')
  const [gifs, setGifs] = useState([])
  const [gifNext, setGifNext] = useState(null)
  const [loadingGifs, setLoadingGifs] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeCategory, setActiveCategory] = useState('Smileys')
  const [favGifs, setFavGifs] = useState(loadFavs)
  const [recentEmojis, setRecentEmojis] = useState(() => {
    try { return JSON.parse(localStorage.getItem('voltchat_recent_emojis')) || [] } catch { return [] }
  })
  
  const [size, setSize] = useState({ width: initialWidth || 320, height: initialHeight || 360 })
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef(null)

  const bottomRef = useRef(null)
  const searchRef = useRef(searchQuery)
  searchRef.current = searchQuery

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = size.width
    const startHeight = size.height

    const handleMouseMove = (moveEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX)))
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + (moveEvent.clientY - startY)))
      setSize({ width: newWidth, height: newHeight })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [size])

  // ── GIF fetching ──────────────────────────────────────────────────────────
  const fetchGifs = useCallback(async (query, pos = null, append = false) => {
    if (!query.trim()) { setGifs([]); setGifNext(null); return }
    append ? setLoadingMore(true) : setLoadingGifs(true)
    try {
      // Use backend proxy to avoid CORS issues
      const apiUrl = new URL('/api/gif/search', window.location.origin)
      apiUrl.searchParams.set('q', query)
      apiUrl.searchParams.set('limit', String(PAGE_SIZE))
      if (pos) apiUrl.searchParams.set('pos', pos)
      const res = await fetch(apiUrl.toString())
      const data = await res.json()
      setGifs(prev => append ? [...prev, ...(data.results || [])] : (data.results || []))
      setGifNext(data.next || null)
    } catch (err) {
      console.error('GIF search error:', err)
    }
    append ? setLoadingMore(false) : setLoadingGifs(false)
  }, [])

  // Debounced search
  useEffect(() => {
    if (activeTab !== 'gif') return
    const t = setTimeout(() => { if (searchRef.current) fetchGifs(searchRef.current) }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, activeTab, fetchGifs])

  // Infinite scroll sentinel
  useEffect(() => {
    if (!bottomRef.current || activeTab !== 'gif') return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && gifNext && !loadingMore && searchQuery) {
        fetchGifs(searchQuery, gifNext, true)
      }
    }, { threshold: 0.1 })
    obs.observe(bottomRef.current)
    return () => obs.disconnect()
  }, [gifNext, loadingMore, searchQuery, activeTab, fetchGifs])

  // ── Favourites ─────────────────────────────────────────────────────────────
  const toggleFav = (gif, e) => {
    e.stopPropagation()
    const url = gif.media_formats?.gif?.url || gif.url
    const preview = gif.media_formats?.tinygif?.url || gif.preview
    setFavGifs(prev => {
      const exists = prev.some(f => f.url === url)
      const next = exists ? prev.filter(f => f.url !== url) : [{ url, preview }, ...prev]
      saveFavs(next)
      return next
    })
  }

  const isFav = (gif) => {
    const url = gif.media_formats?.gif?.url || gif.url
    return favGifs.some(f => f.url === url)
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleEmojiSelect = (emoji) => {
    const updated = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, 32)
    setRecentEmojis(updated)
    localStorage.setItem('voltchat_recent_emojis', JSON.stringify(updated))
    onSelect(emoji)
    onClose?.()
  }

  const handleServerEmojiSelect = (emoji) => {
    // Pass all emoji data including host, serverId, id for global format
    onSelect({ 
      type: 'custom', 
      url: emoji.url, 
      name: emoji.name,
      host: emoji.host,
      serverId: emoji.serverId,
      id: emoji.id
    })
    onClose?.()
  }

  const handleGifSelect = (gif) => {
    const url = gif.media_formats?.gif?.url || gif.url
    onSelect({ type: 'gif', url })
    onClose?.()
  }

  const handleFavSelect = (fav) => {
    onSelect({ type: 'gif', url: fav.url })
    onClose?.()
  }

  // ── GIF tile with fav button ───────────────────────────────────────────────
  const GifTile = ({ gif, onClick }) => {
    const preview = gif.media_formats?.tinygif?.url || gif.preview
    const faved = isFav(gif)
    return (
      <div className="gif-tile" onClick={onClick}>
        <img src={preview} alt={gif.content_description || 'GIF'} loading="lazy" />
        <button
          className={`gif-fav-btn${faved ? ' active' : ''}`}
          onClick={(e) => toggleFav(gif, e)}
          title={faved ? 'Remove favourite' : 'Add to favourites'}
        >
          <HeartIcon size={12} fill={faved ? 'currentColor' : 'none'} />
        </button>
      </div>
    )
  }

  return (
    <div 
      className={`emoji-picker${isResizing ? ' resizing' : ''}`}
      style={{ width: size.width, height: size.height }}
    >
      <div className="emoji-picker-resize-handle" ref={resizeRef} onMouseDown={handleResizeStart}>
        <ArrowsPointingOutIcon size={12} />
      </div>
      <div className="emoji-picker-header">
        <div className="emoji-tabs">
          <button className={`emoji-tab ${activeTab === 'emoji' ? 'active' : ''}`} onClick={() => setActiveTab('emoji')}>😀</button>
          {allEmojis?.length > 0 && (
            <button className={`emoji-tab ${activeTab === 'server' ? 'active' : ''}`} onClick={() => setActiveTab('server')}>🤖</button>
          )}
          {showGifs && (
            <>
              <button className={`emoji-tab ${activeTab === 'gif' ? 'active' : ''}`} onClick={() => setActiveTab('gif')}>GIF</button>
              <button className={`emoji-tab ${activeTab === 'favgif' ? 'active' : ''}`} onClick={() => setActiveTab('favgif')} title={t('emoji.favouriteGifs', 'Favourite GIFs')}>
                <HeartIcon size={14} fill={activeTab === 'favgif' ? 'currentColor' : 'none'} />
              </button>
            </>
          )}
        </div>
        <div className="emoji-search">
          <MagnifyingGlassIcon size={14} />
          {activeTab === 'gif' && (
            <span className="emoji-search-provider">KLIPY</span>
          )}
          <input
            type="text"
            placeholder={activeTab === 'gif' ? t('emoji.searchGifs', 'Search KLIPY') : activeTab === 'favgif' ? t('emoji.searchFavourites', 'Search favourites…') : t('emoji.searchEmoji', 'Search emoji…')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}><XMarkIcon size={12} /></button>
          )}
        </div>
      </div>

      <div className="emoji-picker-content">

        {/* ── Emoji tab ── */}
        {activeTab === 'emoji' && (
          <>
            {!searchQuery && recentEmojis.length > 0 && (
              <div className="emoji-section">
                <h4>{t('emoji.recent', 'Recent')}</h4>
                <div className="emoji-grid">
                  {recentEmojis.map((emoji, i) => (
                    <button key={i} className="emoji-btn" onClick={() => handleEmojiSelect(emoji)}>{emoji}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="emoji-categories">
              {CATEGORY_ORDER.map(category => (
                <button
                  key={category}
                  className={`emoji-category-btn ${activeCategory === category ? 'active' : ''}`}
                  onClick={() => { setActiveCategory(category); setSearchQuery('') }}
                  title={category}
                >
                  {categorizedEmojis[category]?.[0]?.emoji || '😀'}
                </button>
              ))}
            </div>
            <div className="emoji-grid">
              {(searchQuery
                ? ALL_EMOJIS.filter(e => 
                    e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    e.emoji.includes(searchQuery)
                  ).slice(0, 200)
                : (categorizedEmojis[activeCategory] || [])
              ).map((item, i) => (
                <button key={i} className="emoji-btn" onClick={() => handleEmojiSelect(item.emoji)} title={`:${item.name}:`}>{item.emoji}</button>
              ))}
            </div>
          </>
        )}

        {/* ── Server emoji tab ── */}
        {activeTab === 'server' && (
          <div className="emoji-section">
            <h4>{t('emoji.serverEmojis', 'Server Emojis')}</h4>
            <div className="emoji-grid server-emojis">
              {allEmojis?.map((emoji, i) => (
                <button key={i} className="emoji-btn server-emoji-btn" onClick={() => handleServerEmojiSelect(emoji)} title={emoji.serverName ? `${emoji.name} (${emoji.serverName})` : emoji.name}>
                  <img src={emoji.url} alt={emoji.name} />
                </button>
              ))}
              {(!allEmojis || allEmojis.length === 0) && <div className="no-emoji">{t('emoji.noServerEmojis', 'No server emojis')}</div>}
            </div>
          </div>
        )}

        {/* ── GIF search tab ── */}
        {activeTab === 'gif' && (
          <div className="gif-scroll-area">
            {loadingGifs ? (
              <div className="gif-loading"><ArrowPathIcon className="spin" size={24} /></div>
            ) : gifs.length > 0 ? (
              <>
                <div className="gif-grid">
                  {gifs.map((gif, i) => (
                    <GifTile key={gif.id || i} gif={gif} onClick={() => handleGifSelect(gif)} />
                  ))}
                </div>
                {/* Infinite scroll sentinel */}
                <div ref={bottomRef} style={{ height: 1 }} />
                {loadingMore && <div className="gif-loading-more"><ArrowPathIcon className="spin" size={18} /></div>}
                {!gifNext && gifs.length > 0 && (
                  <div className="gif-end">{t('emoji.noMoreResults', 'No more results')}</div>
                )}
              </>
            ) : searchQuery ? (
              <div className="gif-placeholder">{t('emoji.noGifsFound', 'No GIFs found for "{{query}}"', { query: searchQuery })}</div>
            ) : (
              <div className="gif-placeholder">{t('emoji.searchForGifs', 'Search for GIFs…')}</div>
            )}
            <div className="gif-provider-footer">
              <img
                src="/attribution/Powered By KLIPY Horizontal -Yellow&Black Logo.svg"
                alt="Powered by KLIPY"
                className="gif-provider-logo"
                loading="lazy"
              />
            </div>
          </div>
        )}

        {/* ── Favourite GIFs tab ── */}
        {activeTab === 'favgif' && (
          <div className="gif-scroll-area">
            {favGifs.length === 0 ? (
              <div className="gif-placeholder">
                <HeartIcon size={24} style={{ opacity: 0.4 }} />
                <span>No favourites yet.<br/>Click ♥ on any GIF to save it.</span>
              </div>
            ) : (
              <div className="gif-grid">
                {favGifs
                  .filter(f => !searchQuery || f.url.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((fav, i) => (
                    <div key={i} className="gif-tile" onClick={() => handleFavSelect(fav)}>
                      <img src={fav.preview || fav.url} alt="Favourite GIF" loading="lazy" />
                      <button
                        className="gif-fav-btn active"
                        onClick={(e) => { e.stopPropagation(); toggleFav(fav, e) }}
                        title="Remove favourite"
                      >
                        <HeartIcon size={12} fill="currentColor" />
                      </button>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default EmojiPicker
