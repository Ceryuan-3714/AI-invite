Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: '参与话题意愿调查' // Default title
    },
    survey: { // Contains question and options
      type: Object,
      value: {
        question: '',
        options: []
      }
    }
  },

  data: {
    selectedOption: null, // Stores the text of the selected option
    submitAttempted: false // To show validation message only after first submit attempt
  },

  methods: {
    handleOptionChange(e) {
      this.setData({
        selectedOption: e.detail.value
      });
    },

    onClose() {
      this.setData({ show: false, submitAttempted: false, selectedOption: null });
      this.triggerEvent('close');
    },

    onSubmit() {
      this.setData({ submitAttempted: true });
      if (!this.data.selectedOption) {
        // wx.showToast({ title: '请选择一个选项', icon: 'none' }); // Handled by empty-selection-tip
        return;
      }
      // Trigger an event with the selected option, let the parent page handle DB ops
      this.triggerEvent('submit', { selectedOption: this.data.selectedOption });
      // Parent page will be responsible for hiding the modal upon successful submission
      // or can call onClose if needed.
    }
  },
  // Lifecycle method to reset state if component is hidden externally
  observers: {
    'show': function(show) {
      if (!show) {
        this.setData({
          selectedOption: null,
          submitAttempted: false
        });
      }
    }
  }
}) 