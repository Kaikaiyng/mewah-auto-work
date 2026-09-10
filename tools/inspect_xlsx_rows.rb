#!/usr/bin/env ruby

require 'rexml/document'
require 'rexml/parsers/pullparser'

path = ARGV.fetch(0)
row_limit = Integer(ARGV[1] || 120)

def zip_entry(path, entry)
  IO.popen(['unzip', '-p', path, entry], &:read)
end

shared = []
shared_xml = zip_entry(path, 'xl/sharedStrings.xml')
unless shared_xml.empty?
  document = REXML::Document.new(shared_xml)
  shared = document.root.elements.map do |item|
    value = +''
    item.each_recursive do |node|
      value << (node.text || '') if node.is_a?(REXML::Element) && node.name == 't'
    end
    value.gsub(/\s+/, ' ').strip
  end
end

input = IO.popen(['unzip', '-p', path, 'xl/worksheets/sheet1.xml'])
parser = REXML::Parsers::PullParser.new(input)
row_number = 0
cell_ref = nil
cell_type = nil
reading_value = false
value = +''
cells = []

while parser.has_next?
  event = parser.pull
  if event.start_element?
    name = event[0]
    attributes = event[1]
    if name == 'row'
      row_number = attributes['r'].to_i
      cells = []
    elsif name == 'c'
      cell_ref = attributes['r']
      cell_type = attributes['t']
      value = +''
    elsif name == 'v' || name == 't'
      reading_value = true
      value = +''
    end
  elsif event.text? && reading_value
    value << event[0]
  elsif event.end_element?
    name = event[0]
    if name == 'v' || name == 't'
      reading_value = false
    elsif name == 'c'
      resolved = cell_type == 's' ? shared[value.to_i].to_s : value.strip
      cells << "#{cell_ref}=#{resolved.inspect}" unless resolved.empty?
    elsif name == 'row'
      puts "ROW #{row_number}: #{cells.join(' | ')}" unless cells.empty?
      break if row_number >= row_limit
    end
  end
end

input.close
