/**
 * Minimal client for GreatRX static embed pages: postMessage to parent ZafBridge.
 */
(function () {
  function zafGet(key) {
    return new Promise(function (resolve) {
      var id = Math.random().toString(36).slice(2);
      function onMsg(e) {
        var d = e.data;
        if (!d || d.type !== "ZAF_RESPONSE" || String(d.requestId) !== String(id)) return;
        window.removeEventListener("message", onMsg);
        if (d.ok && d.result && Object.prototype.hasOwnProperty.call(d.result, "value")) {
          resolve(d.result.value);
        } else {
          resolve(null);
        }
      }
      window.addEventListener("message", onMsg);
      window.parent.postMessage(
        { type: "ZAF_REQUEST", method: "get", payload: { key: key }, requestId: id },
        "*"
      );
      setTimeout(function () {
        window.removeEventListener("message", onMsg);
        resolve(null);
      }, 8000);
    });
  }

  window.greatrxZaf = { get: zafGet };

  window.greatrxZaf.loadTicketContext = function () {
    return Promise.all([
      zafGet("ticketId"),
      zafGet("pharmacy_id"),
      zafGet("medication_id"),
      zafGet("organizationId")
    ]).then(function (values) {
      return {
        ticketId: values[0],
        pharmacyId: values[1],
        medicationId: values[2],
        organizationId: values[3]
      };
    });
  };
})();
