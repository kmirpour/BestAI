// --- DOM Element References ---
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');    
const clearButton = document.getElementById('clear-button');
const promptChips = document.querySelectorAll('.prompt-gallery .chip');

// --- Global variable to hold AI model data ---
let aiModelsData = null;

// --- Fetch AI Model Data ---
async function fetchModelData() {
    try {
        const response = await fetch('models.js');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        aiModelsData = await response.json();
        console.log("AI Model Data Loaded Successfully.");
        // Initialize after data is loaded
        initializeApp();
    } catch (error) {
        console.error("Could not fetch AI model data:", error);
        displayMessage("Error: Could not load AI model data. Recommendations are unavailable.", 'bot');
        // Disable input if data fails to load
        userInput.disabled = true;
        sendButton.disabled = true;
        promptChips.forEach(chip => chip.style.pointerEvents = 'none');
    }
}

// --- Display Messages ---
function displayMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');

    if (sender === 'user') {
        messageDiv.classList.add('user-message');
        // Use textContent for user messages to prevent XSS
        messageDiv.textContent = text;
    } else if (sender === 'bot') {
        messageDiv.classList.add('bot-message');
        // Use innerHTML for bot messages as we trust the source and need HTML rendering
        messageDiv.innerHTML = text;
    }

    chatMessages.appendChild(messageDiv);
    // Scroll to the bottom smoothly
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

// --- Helper Functions for Keyword Matching ---
function stemWord(word) {
    // Basic stemming (can be expanded)
    if (word.endsWith('ing')) return word.slice(0, -3);
    if (word.endsWith('ed')) return word.slice(0, -2);
    if (word.endsWith('s')) return word.slice(0, -1);
    return word;
}

// --- Find Best Model (Keyword-based Logic + Default Suggestion + Access URL) ---
function findBestModels(promptText) {
    // Check if data is loaded
    if (!aiModelsData || !aiModelsData['AI Models']) {
        console.error("AI Model data is not loaded or has incorrect structure.");
        return { recommendations: [], message: "Sorry, there seems to be an issue with the internal model data. Cannot provide recommendations.", modelScores: [] };
    }

    // Stop Word List (Refined)
    const stopWords = new Set([
        'a', 'an', 'and', 'the', 'in', 'on', 'at', 'for', 'to', 'of', 'it', 'is'
    ]);

    // Context List
    const contexts = new Set([
        'code', 'python', 'multimodal', 'image','images','detect','object','objects', 'segment', 'segmentation',
        'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am',
        'are', 'was', 'were', 'be', 'being', 'been', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'should', 'can', 'could', 'with',
        'about', 'against', 'between', 'into', 'through', 'during', 'before',
        'after', 'above', 'below', 'from', 'up', 'down', 'out', 'off', 'over',
        'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
        'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
        'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
        'same', 'so', 'than', 'too', 'very', 's', 't', 'just', 'don', 'now','generate'
    ]);

    const promptLower = promptText.toLowerCase();
    const promptWords = promptLower
        .replace(/[.,!?;:]/g, '');
    const promptWordsWithContext = promptLower.split(/\s+/);

    let contextScore = 0;
    contexts.forEach((contextWord) => {
        if (promptWordsWithContext.includes(contextWord)) {
            contextScore+=1
        }
    });
    const stemmedPromptWords = promptWords.split(/\s+/)        
        .filter(word => word.length > 1 && !stopWords.has(word));
    const promptUniqueWords = new Set(stemmedPromptWords);

    let allScoredModels = [];

    // Iterate through categories and models to calculate scores
    for (const categoryKey in aiModelsData['AI Models']) {
        const models = aiModelsData['AI Models'][categoryKey];
        if (Array.isArray(models)) {
            models.forEach(model => {
                let score = 0;
                const bestTasks = model['Keywords (Best Tasks)'] || [];
                const specifications = model['Keywords (Specifications)'] || [];

                // Helper function to calculate score
                const calculateScore = (keywords, wordWeight, phraseWeight) => {
                    let currentScore = 0;
                    const keywordsLower = keywords.map(kw => kw.toLowerCase());
                    keywordsLower.forEach(keywordPhrase => {
                        const phraseWords = keywordPhrase.split(' ');
                        const phraseWordCount = phraseWords.length;

                         // Check for full phrase match first (higher weight)
                         if (promptLower.includes(keywordPhrase)) {
                            currentScore += phraseWeight * phraseWordCount;
                         } else if (phraseWords.filter(word => promptUniqueWords.has(stemWord(word))).length > 0) {
                             // Check for partial phrase match

                                currentScore += phraseWeight * (phraseWords.filter(word=>promptUniqueWords.has(stemWord(word))).length/phraseWordCount);
                        } else { // Check for individual word matches (lower weight)
                            stemmedPromptWords.forEach(pWord => {
                                if (keywordPhrase.includes(pWord)) currentScore += wordWeight;
                            });
                        }    
                    }); 
                   return currentScore;
                };

                score += calculateScore(bestTasks, 2, 5); // Higher weight for task keywords
                score += calculateScore(specifications, 1, 3); // Lower weight for spec keywords, phrase match still useful
                score += contextScore;

                if (score > 0) {
                    // Store the full model object along with the score
                    allScoredModels.push({ ...model, score: score });
                }
            });
        }
    }

    // --- Handle No Matches: Suggest Defaults ---
    if (allScoredModels.length === 0) {
        const defaultModel1 = aiModelsData['AI Models']['LLM Models']?.find(m => m['Model Name'].includes('GPT-4o'));
        const defaultModel2 = aiModelsData['AI Models']['LLM Models']?.find(m => m['Model Name'].includes('Gemini Series')); // Find the series

        let defaultMessage = "I couldn't find a specific match based on keywords. For general tasks, you might consider these versatile models:<ul>";
        if (defaultModel1) {
            defaultMessage += `<li><strong class="model-name">${defaultModel1['Model Name']}</strong>`;
            if (defaultModel1['Access URL']) {
                defaultMessage += ` <a href="${defaultModel1['Access URL']}" target="_blank">(Visit)</a>`;
            }
            defaultMessage += `</li>`;
        }
        if (defaultModel2) {
             defaultMessage += `<li><strong class="model-name">${defaultModel2['Model Name']}</strong> (e.g., Gemini Flash for speed/cost balance)`;
             if (defaultModel2['Access URL']) {
                 defaultMessage += ` <a href="${defaultModel2['Access URL']}" target="_blank">(Visit)</a>`;
             }
             defaultMessage += `</li>`;
        }
        defaultMessage += "</ul>";

        // Return empty recommendations but with the default message
        return { recommendations: [], message: defaultMessage, modelScores: [] };
    }

    // --- Process Found Matches ---
    allScoredModels.sort((a, b) => b.score - a.score); // Sort by score

    const topScore = allScoredModels[0].score;
    // Get all models with the top score
    const bestModels = allScoredModels.filter(model => model.score === topScore);
    // Limit recommendations, but ensure we show all top-scoring ones if there are fewer than 5
    const limitedRecommendations = bestModels.slice(0, 5);

    let message;
     if (limitedRecommendations.length > 1) {
         message = `Based on your request, here are a few models that seem suitable (Top Score: ${topScore}):`;
     } else {
         message = `Based on your request, a strong candidate appears to be (Score: ${topScore}):`;
     }

    // Map recommendations to include name and URL for the final output
    const finalRecommendations = limitedRecommendations.map(m => ({
        name: m['Model Name'],
        url: m['Access URL'] // Include the URL
    }));

    return { recommendations: finalRecommendations, message: message, modelScores: allScoredModels };
}


// --- Handle User Input Submission ---
function handleSend() {
    // Ensure data is loaded before processing
    if (!aiModelsData) {
        displayMessage("Still loading model data, please wait...", 'bot');
        return;
    }

    const text = userInput.value.trim();
    if (text === '') return;

    displayMessage(text, 'user'); // Show user's query
    userInput.value = ''; // Clear input

    // Use a minimal delay, processing is fast locally
    setTimeout(() => {
        const result = findBestModels(text);
        let botResponse = result.message; // Initial message ("Based on request..." or "Couldn't find...")

        // Only add the list if specific recommendations were found (not the default message)
        if (result.recommendations.length > 0) {
            botResponse += "<ul>";
            result.recommendations.forEach(model => {
                botResponse += `<li><strong class="model-name">${model.name}</strong>`;
                // Add the link if URL exists
                if (model.url) {
                    botResponse += ` <a href="${model.url}" target="_blank">(Visit)</a>`;
                }
                botResponse += `</li>`;
            });
            botResponse += "</ul>";

             // Add the note about matches shown vs found
             const totalMatches = result.modelScores.length;
             if (result.recommendations.length < totalMatches) {
                 const shownCount = result.recommendations.length;
                 const topCount = result.modelScores.filter(m => m.score === result.modelScores[0].score).length;

                 botResponse += `<hr/>`; // Separator
                 if (shownCount < topCount) {
                      botResponse += `<p><small>Showing the top ${shownCount} of ${topCount} models with the highest score. ${totalMatches} total matches found.</small></p>`;
                 } else if (shownCount < totalMatches) {
                     botResponse += `<p><small>Showing the best ${shownCount} matches found (${totalMatches} total).</small></p>`;
                 }
             }
        }
        // If recommendations array is empty, it means the default message was generated,
        // which already includes necessary formatting (like the list of defaults).

        displayMessage(botResponse, 'bot'); // Display the final bot response
    }, 50); // Reduced delay
}

// --- Function to set input value from chips ---
function setPrompt(text) {
  userInput.value = text;
  userInput.focus(); // Focus input field
}

// --- Initialize Application (Called after data is fetched) ---
function initializeApp() {
    // --- Event Listeners ---

    // Send button click
    sendButton.addEventListener('click', handleSend);

    // Enter key press in input field
    userInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Prevent newline
            handleSend();
        }
    });

    //clear button click
    clearButton.addEventListener('click', () => {
        chatMessages.innerHTML = '';
        displayMessage("", 'bot');
    });

    // Prompt gallery chip clicks
    promptChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const promptText = chip.getAttribute('data-prompt');
            if (promptText) {
                setPrompt(promptText);
                // Optional: Automatically send after clicking a chip
                // handleSend();
            }
        });
    });

    // --- Initial Load Message ---
    displayMessage("Enter a task description above, or click a suggestion!", 'bot');
    console.log("AI Model Recommender Initialized.");
}

// --- Start Data Fetching ---
fetchModelData();

