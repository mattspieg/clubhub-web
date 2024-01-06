document.addEventListener('DOMContentLoaded', () => {
    conosle.log("test worked")
    const defaultUrlParamInput = document.getElementById('Default-URL-Parameters');
    const allUrlParamsInput = document.getElementById('All-URL-Parameters');
    const form = document.getElementById('wf-form-Checkout-Form');
  
    const addOrUpdateUrlParam = (key, value) => {
      let params = defaultUrlParamInput.value;
      params += params ? "&" : "";
      params += `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      defaultUrlParamInput.value = params;
    };
  
    addOrUpdateUrlParam("mode", "payment");
    //addOrUpdateUrlParam("success_url", "https://stripe-cart-checkout.webflow.io/success?session_id={CHECKOUT_SESSION_ID}");
    addOrUpdateUrlParam("cancel_url", window.location.href);
    addOrUpdateUrlParam("payment_method_types[]", "card");
    addOrUpdateUrlParam("metadata[ticket_ids]", "[1,2,3]");
    addOrUpdateUrlParam("metadata[purchased_item]", "Ticket");
    addOrUpdateUrlParam("payment_intent_data[metadata][ticket_ids]", "[1,2,3]");
    addOrUpdateUrlParam("payment_intent_data[metadata][purchased_item]", "Ticket");
  
    const updateAllUrlParameters = () => {
      const variantInputs = Array.from(document.querySelectorAll('input[id*="variant"]'));
      let allValues = variantInputs.map(input => input.value).filter(value => value).join('&');
      allValues += allValues && defaultUrlParamInput.value ? '&' + defaultUrlParamInput.value : defaultUrlParamInput.value;
      if (allUrlParamsInput) allUrlParamsInput.value = allValues;
    };
    
    const attachInputListeners = () => {
      document.querySelectorAll('input[id*="Variant"], input[id*="Variant-Quantity"]')
        .forEach(input => input.addEventListener('input', () => {
          updateAllUrlParameters();
        }));
    };
  
    attachInputListeners();
    defaultUrlParamInput.addEventListener('input', updateAllUrlParameters);
    
    form.addEventListener('submit', event => {
      event.preventDefault();
      
      const ticketVariants = getTicketVariantData(form);

      // Create a new FormData object
      let formData = new FormData(form);
      let formDataObject = {};

      // Convert FormData into a regular object
      for (let [key, value] of formData.entries()) {
          formDataObject[key] = value;
      }

      // Properly log the formDataObject
      console.log("formDataObject: ", JSON.stringify(formDataObject, null, 2));

      // Use formDataObject in constructSuccessURL
      let newSuccessUrl = constructSuccessURL(formDataObject);

      // Update the success_url parameter
      addOrUpdateUrlParam("success_url", newSuccessUrl);

      checkTicketAvailability(ticketVariants).then(isAvailable => {
        if (isAvailable) {
          reserveAndCheckout(ticketVariants);
        } else {
          console.error('One or more variants exceed available tickets');
        }
      });
    });
    
    function getTicketVariantData(form) {
      return Array.from(form.querySelectorAll('input[name="Variant-Quantity"]')).map(input => {
        const variantName = input.getAttribute('data-variant-name') || '';
        const ticketId = input.getAttribute('data-variant-id') || '';
        const quantity = parseInt(input.value, 10) || 0;
        return quantity > 0 ? { name: variantName, quantity, ticketId } : null;
      }).filter(Boolean);
    }
  
    function reserveTicket(variant) {
      const eventId = "{{wf {&quot;path&quot;:&quot;event-id&quot;,&quot;type&quot;:&quot;PlainText&quot;\} }}"; 

      return Promise.all(Array(variant.quantity).fill().map(() => {
        const json = JSON.stringify({
          variantName: variant.name, 
          quantity: 1,
          event_id: eventId  // Include event_id in the request body
        });
        return fetch('https://hook.eu2.make.com/5o6t898ehqkqc6d82oas1tdvus5ef843', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json
        })
        .then(response => response.ok ? response.text() : Promise.reject('Network response was not ok'))
        .catch(error => {
          console.error('Error reserving ticket:', error);
          throw error;
        });
      }));
    }
  
    function checkTicketAvailability(variants) {
      const checks = variants.map(variant => {
        const ticketId = variant.ticketId;
        return fetch('https://hook.eu2.make.com/d9khdntytfvszob2mabp1i2p7aujsrqc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId })
          })
          .then(response => response.ok ? response.json() : Promise.reject(`HTTP error! status: ${response.status}`))
          .then(data => {
            if (data && Array.isArray(data) && data.length > 0) {
              const ticketsLeft = data[0].tickets_left;
              console.log("Tickets left: "+ticketsLeft);
              return ticketsLeft >= variant.quantity;
            } else {
              console.error('Data format is unexpected:', data);
              return false;
            }
          })
          .catch(error => {
            console.error('Error:', error);
            return false;
          });
      });
  
      return Promise.all(checks).then(results => results.every(result => result));
    }
  
    function reserveAndCheckout(ticketVariants) {
      Promise.all(ticketVariants.map(variant => reserveTicket(variant)))
        .then(requestedVariantIds => {
          addOrUpdateUrlParam("metadata[itemIds]", requestedVariantIds.join(','));
          updateAllUrlParameters();
          createCheckoutSession(new FormData(form));
        })
        .catch(error => console.error('Error reserving tickets:', error));
    }
  
    function createCheckoutSession(formData) {
      const object = Array.from(formData.entries()).reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
      const json = JSON.stringify(object);
  
      fetch('https://hook.eu2.make.com/halrisxq9jwqwsj7g75m9qajqg4iat4m', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json
      })
      .then(response => response.json())
      .then(data => {
        if (data?.url) {
          window.location.href = data.url;
        } else {
          console.error('No URL found in the response');
        }
      })
      .catch(error => console.error('Error:', error));
    }
    function constructSuccessURL(formData) {
        // Initialize the base URL and parameters
        let baseURL = `${window.location.protocol}//${window.location.host}/success?`;
        let itemsImage = "{{wf {&quot;path&quot;:&quot;event-photo&quot;,&quot;type&quot;:&quot;ImageRef&quot;\} }}"; // replace with actual image URL if dynamic
        let itemsTotal = 0;
        let itemsCurrency = "";

        // Helper function to extract data from variant string
        const extractData = (variantStr) => {
            let data = {};
            const params = variantStr.split('&');
            params.forEach(param => {
                let [key, value] = param.split('=');
                if (key.includes('quantity')) data.quantity = decodeURIComponent(value);
                if (key.includes('unit_amount')) data.price = decodeURIComponent(value);
                if (key.includes('currency')) data.currency = decodeURIComponent(value);
                if (key.includes('name')) data.title = decodeURIComponent(value);
            });
            return data;
        };

        // Process each variant-param
        for (let key in formData) {
            if (key.startsWith('variant-params-')) {
                let variantData = extractData(formData[key]);
                itemsTotal += parseInt(variantData.price) * parseInt(variantData.quantity);
                itemsCurrency = variantData.currency; // Assuming the same currency for all variants

                baseURL += `item${encodeURIComponent(key.replace('variant-params-', ''))}title=${encodeURIComponent(variantData.title)}&`;
                baseURL += `item${encodeURIComponent(key.replace('variant-params-', ''))}price=${encodeURIComponent(variantData.price)}&`;
                baseURL += `item${encodeURIComponent(key.replace('variant-params-', ''))}quantity=${encodeURIComponent(variantData.quantity)}&`;
            }
        }

        // Add general parameters
        baseURL += `itemsImage=${encodeURIComponent(itemsImage)}&itemsTotal=${encodeURIComponent(itemsTotal)}&itemsCurrency=${encodeURIComponent(itemsCurrency)}`;

        console.log(baseURL);
        return baseURL;
    }
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.form-input_wrapper input[type="number"]').forEach(input => {
          input.addEventListener('input', function() {
            this.parentElement.classList.toggle('max-reached', this.valueAsNumber >= parseInt(this.max, 10));
          });
        });
      
        const incrementValue = inputField => {
          const currentValue = parseInt(inputField.value);
          inputField.value = isNaN(currentValue) ? 1 : currentValue + 1;
          inputField.dispatchEvent(new Event('input'));
        };
      
        const decrementValue = inputField => {
          const currentValue = parseInt(inputField.value);
          inputField.value = Math.max(0, isNaN(currentValue) ? 0 : currentValue - 1);
          inputField.dispatchEvent(new Event('input'));
        };
      
        document.querySelectorAll('.quantity-input').forEach((inputField, index) => {
          document.querySelectorAll('.is-top-button')[index].addEventListener('click', () => incrementValue(inputField));
          document.querySelectorAll('.form-input_number-spin-button:not(.is-top-button)')[index].addEventListener('click', () => decrementValue(inputField));
        });
    });
  });
