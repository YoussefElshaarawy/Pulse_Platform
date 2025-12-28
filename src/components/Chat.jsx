import { marked } from "marked";
import DOMPurify from "dompurify";
import { useEffect, useState } from "react";

import BotIcon from "./icons/BotIcon";
import UserIcon from "./icons/UserIcon";
import "./Chat.css";

function render(text) {
  return DOMPurify.sanitize(marked.parse(text));
}

// مكون فرعي لكل رسالة للتحكم في التقييم والاقتراحات
function MessageItem({ msg }) {
  const [feedback, setFeedback] = useState(null); // 'up' or 'down'
  const [showOptions, setShowOptions] = useState(false);

  const medicalOptions = [
    "Not medically accurate",
    "Does not follow ABCDE protocol",
    "Too long for emergency context",
    "Incorrect dosage suggestion",
    "Other medical reason"
  ];

  const handleOptionClick = (option) => {
    alert(`Thank you for your feedback: "${option}". This helps improve the ER Assistant.`);
    setShowOptions(false);
    setFeedback('down');
  };

  return (
    <div className="flex items-start space-x-4 mb-4 relative">
      {msg.role === "assistant" ? (
        <>
          <BotIcon className="h-6 w-6 min-h-6 min-w-6 my-3 text-gray-500 dark:text-gray-300" />
          <div className="flex flex-col items-start w-full">
            <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-4 w-full">
              <p className="min-h-6 text-gray-800 dark:text-gray-200 overflow-wrap-anywhere">
                {msg.content.length > 0 ? (
                  <span
                    className="markdown"
                    dangerouslySetInnerHTML={{ __html: render(msg.content) }}
                  />
                ) : (
                  <span className="h-6 flex items-center gap-1">
                    <span className="w-2.5 h-2.5 bg-gray-600 dark:bg-gray-300 rounded-full animate-pulse"></span>
                    <span className="w-2.5 h-2.5 bg-gray-600 dark:bg-gray-300 rounded-full animate-pulse animation-delay-200"></span>
                    <span className="w-2.5 h-2.5 bg-gray-600 dark:bg-gray-300 rounded-full animate-pulse animation-delay-400"></span>
                  </span>
                )}
              </p>
            </div>
            
            {/* أزرار التقييم - تظهر فقط بعد انتهاء الكتابة */}
            {msg.content.length > 0 && (
              <div className="flex items-center mt-2 space-x-3 text-gray-400 ml-1">
                <button 
                  onClick={() => {setFeedback('up'); setShowOptions(false);}}
                  className={`hover:text-green-500 transition-colors ${feedback === 'up' ? 'text-green-500' : ''}`}
                  title="Correct"
                >
                  👍
                </button>
                <button 
                  onClick={() => setShowOptions(!showOptions)}
                  className={`hover:text-red-500 transition-colors ${feedback === 'down' ? 'text-red-500' : ''}`}
                  title="Incorrect"
                >
                  👎
                </button>
                {/* نافذة الأسباب (Popup) */}
                {showOptions && (
                  <div className="absolute z-50 mt-10 left-10 p-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl shadow-2xl w-64 animate-in fade-in zoom-in duration-200">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">What went wrong?</h4>
                      <button onClick={() => setShowOptions(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {medicalOptions.map((option) => (
                        <button
                          key={option}
                          onClick={() => handleOptionClick(option)}
                          className="text-left text-xs p-2.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg border border-transparent hover:border-red-200 transition-all text-gray-700 dark:text-gray-300"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {feedback === 'up' && <span className="text-[10px] text-green-600 font-medium">Feedback sent!</span>}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <UserIcon className="h-6 w-6 min-h-6 min-w-6 my-3 text-gray-500 dark:text-gray-300" />
          <div className="bg-blue-500 text-white rounded-lg p-4">
            <p className="min-h-6 overflow-wrap-anywhere">{msg.content}</p>
          </div>
        </>
      )}
    </div>
  );
}

export default function Chat({ messages }) {
  const empty = messages.length === 0;

  useEffect(() => {
    if (window.MathJax) {
      window.MathJax.typeset();
    }
  }, [messages]);

  return (
    <div
      className={`flex-1 p-6 max-w-[960px] w-full ${empty ? "flex flex-col items-center justify-end" : "space-y-4"}`}
    >
      {empty ? (
        <div className="text-xl font-medium text-gray-400">ER Assistant is Ready...</div>
      ) : (
        messages.map((msg, i) => (
          <MessageItem key={`message-${i}`} msg={msg} />
        ))
      )}
    </div>
  );
}