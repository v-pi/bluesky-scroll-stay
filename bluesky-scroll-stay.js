// ==UserScript==
// @name         Bluesky Load New & Stay (Deep Engine Hook)
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  Monkey-patch le moteur JavaScript pour bloquer le scrollTo 0 de React Native.
// @author       Toi + IA
// @match        https://bsky.app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bsky.app
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Notre variable magique pour activer/désactiver le bouclier
    window.__bskyStayActive = false;

    // =========================================================================
    // LE MONKEY PATCH DE L'EXTRÊME
    // =========================================================================

    // 1. On sauvegarde le vrai "setter" matériel de la barre de défilement
    const origScrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    
    // 2. On le pirate pour intercepter les manipulations directes (element.scrollTop = 0)
    Object.defineProperty(Element.prototype, 'scrollTop', {
        set: function(val) {
            // Si on charge des posts ET que Bluesky essaie de forcer le retour en haut (val < 100px)
            if (window.__bskyStayActive && val < 100) {
                console.log("[Bluesky Stay] 🛑 Blocage profond de React (element.scrollTop = " + val + ")");
                return; // On annule l'opération purement et simplement
            }
            // Sinon, on laisse l'opération se faire
            origScrollTop.set.call(this, val);
        },
        get: function() {
            return origScrollTop.get.call(this);
        }
    });

    // 3. On pirate aussi les fonctions classiques au cas où
    const blockScrollFn = function(origFn, name) {
        return function() {
            if (window.__bskyStayActive) {
                let top = arguments[0] && typeof arguments[0] === 'object' ? arguments[0].top : arguments[1];
                if (top !== undefined && top < 100) {
                    console.log(`[Bluesky Stay] 🛑 Blocage de la fonction ${name}(${top})`);
                    return;
                }
            }
            return origFn.apply(this, arguments);
        };
    };

    window.scrollTo = blockScrollFn(window.scrollTo, 'window.scrollTo');
    window.scroll = blockScrollFn(window.scroll, 'window.scroll');
    Element.prototype.scrollTo = blockScrollFn(Element.prototype.scrollTo, 'Element.scrollTo');

    // =========================================================================
    // LOGIQUE DE L'INTERFACE ET DU BOUTON
    // =========================================================================

    function getScrollContainer(element) {
        let parent = element.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
            const style = window.getComputedStyle(parent);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                return parent;
            }
            parent = parent.parentElement;
        }
        return window; 
    }

    function injectStayButton(originalBtn) {
        originalBtn.setAttribute('data-stay-processed', 'true');
        const parent = originalBtn.parentNode;
        
        parent.style.display = 'flex';
        parent.style.flexDirection = 'row';
        parent.style.gap = '10px';

        const stayBtn = originalBtn.cloneNode(true);
        stayBtn.setAttribute('aria-label', 'Load new and stay');
        stayBtn.removeAttribute('data-stay-processed');
        
        stayBtn.style.backgroundColor = "#208bfe";
        stayBtn.style.borderColor = "#208bfe";
        stayBtn.innerHTML = '<span style="color:white; font-size:18px; line-height:1; display:flex; align-items:center; justify-content:center; width:100%; height:100%;">⚓</span>';

        stayBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleLoadAndStay(originalBtn);
        });

        parent.appendChild(stayBtn);
    }

    function handleLoadAndStay(originalBtn) {
        const scrollContainer = getScrollContainer(originalBtn);
        const isWindow = scrollContainer === window;
        const targetToObserve = isWindow ? document.body : (scrollContainer.firstElementChild || scrollContainer);
        
        // On active le bouclier anti-retour en haut !
        window.__bskyStayActive = true;
        console.log("[Bluesky Stay] 🛡️ Bouclier activé.");

        let lastHeight = isWindow ? document.documentElement.scrollHeight : scrollContainer.scrollHeight;

        // Le radar qui va capter l'insertion de nouveaux posts par React
        const resizeObserver = new ResizeObserver(() => {
            const currentHeight = isWindow ? document.documentElement.scrollHeight : scrollContainer.scrollHeight;
            const delta = currentHeight - lastHeight;
            
            if (delta > 0) {
                console.log(`[Bluesky Stay] 📏 React a inséré ${delta}px de contenu. On compense la molette.`);
                // On utilise le setter direct (en bypassant notre propre sécurité si besoin)
                const targetObj = isWindow ? document.documentElement : scrollContainer;
                const currentScroll = origScrollTop.get.call(targetObj);
                origScrollTop.set.call(targetObj, currentScroll + delta);
                
                lastHeight = currentHeight;
            }
        });

        resizeObserver.observe(targetToObserve);

        // On déclenche le chargement (React va faire son travail et se cogner à notre bouclier)
        originalBtn.click();

        // On relâche le bouclier après 3 secondes
        setTimeout(() => {
            resizeObserver.disconnect();
            window.__bskyStayActive = false;
            console.log("[Bluesky Stay] 🛡️ Bouclier désactivé. Retour à la normale.");
        }, 3000);
    }

    const observer = new MutationObserver(() => {
        const btn = document.querySelector('button[aria-label*="nouveaux"]:not([data-stay-processed="true"]), button[aria-label*="new posts"]:not([data-stay-processed="true"])');
        if (btn) {
            injectStayButton(btn);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();